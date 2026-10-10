import { handleOptions, json, errorResponse } from '../_shared/cors.ts';
import { getAdminClient, getUserId, getUserSettings } from '../_shared/supabaseAdmin.ts';
import { classifyBrevoError } from '../_shared/emailProviders.ts';
import { rateLimitFromHeaders, recordProviderUsage } from '../_shared/providerTelemetry.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIVE_DELIVERY = ['queued', 'scheduled', 'sending', 'retrying'];
const FAILED_DELIVERY = ['failed', 'blocked'];
const PAGE_SIZE = 1_000;
const BREVO_CACHE_MS = 2 * 60_000;

type UsageEvent = { units: number | null; observed_at: string };
type BrevoCard = {
  source: 'provider_reported';
  status: 'healthy' | 'unhealthy' | 'unknown' | 'not_configured';
  message?: string;
  errorCode?: string;
  credits: Array<{ type?: string; credits?: number; creditsType?: string }>;
  rateLimit: { limit: number; remaining: number; resetSeconds: number } | null;
};

async function loadUsageEvents(admin: SupabaseClient, input: { ownerId: string; workspaceId: string | null; provider: 'serper' | 'nvidia'; after: string | null }) {
  const rows: UsageEvent[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = admin.from('provider_usage_events').select('units,observed_at')
      .eq('owner_id', input.ownerId).eq('provider', input.provider).order('observed_at', { ascending: false });
    query = input.workspaceId === null ? query.is('workspace_id', null) : query.eq('workspace_id', input.workspaceId);
    if (input.after) query = query.gte('observed_at', input.after);
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as UsageEvent[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

function deliveryFailureSummary(row: { last_error_code?: string | null; error_message?: string | null }) {
  if (row.last_error_code === 'brevo_ip_restricted') return 'Brevo blocked the sending server IP. Review Brevo API-key IP restrictions.';
  if (row.last_error_code === '429') return 'The provider rate-limited this delivery.';
  return row.error_message?.startsWith('Daily send limit') ? row.error_message : 'Delivery failed. Open the campaign for technical details.';
}

Deno.serve(async (request) => {
  const preflight = handleOptions(request);
  if (preflight) return preflight;
  try {
    const userId = await getUserId(request);
    const workspaceId = new URL(request.url).searchParams.get('workspace_id') ?? '';
    if (!UUID.test(workspaceId)) return errorResponse('A valid workspace_id is required.', 400);
    const admin = getAdminClient();
    const { data: membership, error: membershipError } = await admin.from('workspace_members').select('workspace_id')
      .eq('workspace_id', workspaceId).eq('user_id', userId).maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) return errorResponse('Workspace membership required.', 403);

    const settings = await getUserSettings(admin, userId);
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const [
      { count: microsoftUsed, error: sendError },
      { count: queuedCount, error: queuedError },
      { count: failedCount, error: failedError },
      { data: oldestQueued, error: oldestError },
      { data: recentFailureRows, error: recentFailureError },
      { data: budgets, error: budgetError },
      { data: cachedBrevo, error: cacheError },
    ] = await Promise.all([
      admin.from('email_sends').select('id', { count: 'exact', head: true }).eq('created_by', userId).eq('status', 'sent').gte('sent_at', since),
      admin.from('email_sends').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('created_by', userId).in('status', ACTIVE_DELIVERY),
      admin.from('email_sends').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('created_by', userId).in('status', FAILED_DELIVERY),
      admin.from('email_sends').select('created_at').eq('workspace_id', workspaceId).eq('created_by', userId).in('status', ACTIVE_DELIVERY).order('created_at', { ascending: true }).limit(1).maybeSingle(),
      admin.from('email_sends').select('id,campaign_id,to_email,status,last_error_code,error_message,failed_at,blocked_at,updated_at').eq('workspace_id', workspaceId).eq('created_by', userId).in('status', FAILED_DELIVERY).order('updated_at', { ascending: false }).limit(10),
      admin.from('provider_budget_settings').select('provider,budget_units,reset_at').eq('workspace_id', workspaceId).eq('owner_id', userId),
      admin.from('provider_status_cache').select('status_payload,checked_at,expires_at').eq('workspace_id', workspaceId).eq('owner_id', userId).eq('provider', 'brevo').maybeSingle(),
    ]);
    if (sendError) throw sendError;
    if (queuedError) throw queuedError;
    if (failedError) throw failedError;
    if (oldestError) throw oldestError;
    if (recentFailureError) throw recentFailureError;
    if (budgetError) throw budgetError;
    if (cacheError) throw cacheError;

    const budgetFor = (provider: 'serper' | 'nvidia') => (budgets ?? []).find((row) => row.provider === provider);
    const serperBudget = budgetFor('serper');
    const nvidiaBudget = budgetFor('nvidia');
    const [serperEvents, nvidiaWorkspaceEvents, nvidiaGlobalEvents] = await Promise.all([
      loadUsageEvents(admin, { ownerId: userId, workspaceId, provider: 'serper', after: serperBudget?.reset_at ?? null }),
      loadUsageEvents(admin, { ownerId: userId, workspaceId, provider: 'nvidia', after: nvidiaBudget?.reset_at ?? null }),
      loadUsageEvents(admin, { ownerId: userId, workspaceId: null, provider: 'nvidia', after: nvidiaBudget?.reset_at ?? null }),
    ]);
    const tracked = (events: UsageEvent[], budget: { budget_units?: number | null; reset_at?: string | null } | undefined) => ({
      source: 'crm_tracked',
      used: events.reduce((total, row) => total + Number(row.units ?? 0), 0),
      limit: budget?.budget_units ?? null,
      resetAt: budget?.reset_at ?? null,
    });

    const campaignIds = [...new Set((recentFailureRows ?? []).map((row) => row.campaign_id).filter(Boolean))] as string[];
    let campaignNames = new Map<string, string>();
    if (campaignIds.length) {
      const { data: campaigns, error } = await admin.from('crm_email_campaigns').select('id,name')
        .eq('workspace_id', workspaceId).eq('created_by', userId).in('id', campaignIds);
      if (error) throw error;
      campaignNames = new Map((campaigns ?? []).map((campaign) => [campaign.id, campaign.name]));
    }
    const recentFailures = (recentFailureRows ?? []).map((row) => ({
      id: row.id,
      campaignId: row.campaign_id,
      campaignName: row.campaign_id ? campaignNames.get(row.campaign_id) ?? null : null,
      toEmail: row.to_email,
      status: row.status,
      summary: deliveryFailureSummary(row),
      occurredAt: row.failed_at ?? row.blocked_at ?? row.updated_at,
    }));

    let checkedAt = new Date().toISOString();
    let brevo: BrevoCard = { source: 'provider_reported', status: settings?.brevo_api_key ? 'unknown' : 'not_configured', credits: [], rateLimit: null };
    const cacheIsFresh = cachedBrevo && new Date(cachedBrevo.expires_at).getTime() > Date.now();
    if (settings?.brevo_api_key && cacheIsFresh) {
      brevo = cachedBrevo.status_payload as BrevoCard;
      checkedAt = cachedBrevo.checked_at;
    } else if (settings?.brevo_api_key) {
      try {
        const response = await fetch('https://api.brevo.com/v3/account', { headers: { accept: 'application/json', 'api-key': settings.brevo_api_key } });
        const body = await response.text();
        const rateLimit = rateLimitFromHeaders(response.headers);
        if (response.ok) {
          const account = JSON.parse(body) as { plan?: Array<{ type?: string; credits?: number; creditsType?: string }> };
          const credits = (account.plan ?? []).map((credit) => ({
            ...(typeof credit.type === 'string' ? { type: credit.type.slice(0, 80) } : {}),
            ...(typeof credit.credits === 'number' ? { credits: credit.credits } : {}),
            ...(typeof credit.creditsType === 'string' ? { creditsType: credit.creditsType.slice(0, 80) } : {}),
          }));
          brevo = { source: 'provider_reported', status: 'healthy', credits, rateLimit };
        } else {
          const failure = classifyBrevoError(response.status, body);
          brevo = { source: 'provider_reported', status: 'unhealthy', errorCode: failure.errorCode, message: failure.errorMessage, credits: [], rateLimit };
        }
        checkedAt = new Date().toISOString();
        await admin.from('provider_status_cache').upsert({
          workspace_id: workspaceId, owner_id: userId, provider: 'brevo', status_payload: brevo,
          checked_at: checkedAt, expires_at: new Date(Date.now() + BREVO_CACHE_MS).toISOString(),
        }, { onConflict: 'workspace_id,owner_id,provider' });
        await recordProviderUsage(admin, { ownerId: userId, workspaceId, provider: 'brevo', operation: 'account_check', units: 0, succeeded: response.ok, errorCategory: response.ok ? null : String(response.status), rateLimit });
      } catch {
        brevo = { source: 'provider_reported', status: 'unknown', message: 'Brevo did not return an account status.', credits: [], rateLimit: null };
      }
    }

    return json({
      checkedAt,
      delivery: { queued: queuedCount ?? 0, failed: failedCount ?? 0, oldestQueuedAt: oldestQueued?.created_at ?? null, recentFailures },
      brevo,
      microsoft: { source: 'crm_tracked', used: microsoftUsed ?? 0, limit: settings?.daily_send_limit ?? 50, resetAt: null },
      serper: tracked(serperEvents, serperBudget),
      nvidia: tracked([...nvidiaWorkspaceEvents, ...nvidiaGlobalEvents], nvidiaBudget),
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : String(error), 500);
  }
});
