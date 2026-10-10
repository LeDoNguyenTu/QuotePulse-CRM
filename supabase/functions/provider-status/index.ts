import { handleOptions, json, errorResponse } from '../_shared/cors.ts';
import { getAdminClient, getUserId, getUserSettings } from '../_shared/supabaseAdmin.ts';
import { classifyBrevoError } from '../_shared/emailProviders.ts';
import { rateLimitFromHeaders, recordProviderUsage } from '../_shared/providerTelemetry.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    const [{ count: microsoftUsed, error: sendError }, { data: deliveryRows, error: deliveryError }, { data: events, error: usageError }, { data: globalNvidiaEvents, error: globalNvidiaError }, { data: budgets, error: budgetError }] = await Promise.all([
      admin.from('email_sends').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('created_by', userId).eq('status', 'sent').gte('sent_at', since),
      admin.from('email_sends').select('status,created_at').eq('workspace_id', workspaceId).eq('created_by', userId).in('status', ['queued','scheduled','sending','retrying','failed','blocked']).order('created_at', { ascending: true }).limit(1000),
      admin.from('provider_usage_events').select('provider,units,succeeded,error_category,provider_limit,provider_remaining,provider_reset_at,observed_at').eq('workspace_id', workspaceId).eq('owner_id', userId).order('observed_at', { ascending: false }).limit(1000),
      admin.from('provider_usage_events').select('provider,units,succeeded,error_category,observed_at').is('workspace_id', null).eq('owner_id', userId).eq('provider', 'nvidia').order('observed_at', { ascending: false }).limit(1000),
      admin.from('provider_budget_settings').select('provider,budget_units,reset_at').eq('workspace_id', workspaceId).eq('owner_id', userId),
    ]);
    if (sendError) throw sendError;
    if (deliveryError) throw deliveryError;
    if (usageError) throw usageError;
    if (globalNvidiaError) throw globalNvidiaError;
    if (budgetError) throw budgetError;

    const tracked = (provider: 'serper' | 'nvidia') => {
      const budget = (budgets ?? []).find((row) => row.provider === provider);
      const after = budget?.reset_at ? new Date(budget.reset_at).getTime() : 0;
      const relevantEvents = provider === 'nvidia' ? [...(events ?? []), ...(globalNvidiaEvents ?? [])] : (events ?? []);
      const used = relevantEvents.filter((row) => row.provider === provider && new Date(row.observed_at).getTime() >= after)
        .reduce((total, row) => total + Number(row.units ?? 0), 0);
      return { source: 'crm_tracked', used, limit: budget?.budget_units ?? null, resetAt: budget?.reset_at ?? null };
    };

    let brevo: Record<string, unknown> = { source: 'provider_reported', status: settings?.brevo_api_key ? 'unknown' : 'not_configured', credits: [], rateLimit: null };
    if (settings?.brevo_api_key) {
      try {
        const response = await fetch('https://api.brevo.com/v3/account', { headers: { accept: 'application/json', 'api-key': settings.brevo_api_key } });
        const body = await response.text();
        const rateLimit = rateLimitFromHeaders(response.headers);
        if (response.ok) {
          const account = JSON.parse(body) as { plan?: Array<{ type?: string; credits?: number; creditsType?: string }> };
          brevo = { source: 'provider_reported', status: 'healthy', credits: account.plan ?? [], rateLimit };
        } else {
          const failure = classifyBrevoError(response.status, body);
          brevo = { source: 'provider_reported', status: 'unhealthy', errorCode: failure.errorCode, message: failure.errorMessage, credits: [], rateLimit };
        }
        await recordProviderUsage(admin, { ownerId: userId, workspaceId, provider: 'brevo', operation: 'account_check', units: 0, succeeded: response.ok, errorCategory: response.ok ? null : String(response.status), rateLimit });
      } catch {
        brevo = { source: 'provider_reported', status: 'unknown', message: 'Brevo did not return an account status.', credits: [], rateLimit: null };
      }
    }

    const queuedRows = (deliveryRows ?? []).filter((row) => ['queued','scheduled','sending','retrying'].includes(row.status));
    const failedRows = (deliveryRows ?? []).filter((row) => ['failed','blocked'].includes(row.status));
    return json({
      checkedAt: new Date().toISOString(),
      delivery: { queued: queuedRows.length, failed: failedRows.length, oldestQueuedAt: queuedRows[0]?.created_at ?? null },
      brevo,
      microsoft: { source: 'crm_tracked', used: microsoftUsed ?? 0, limit: settings?.daily_send_limit ?? 50, resetAt: null },
      serper: tracked('serper'),
      nvidia: tracked('nvidia'),
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : String(error), 500);
  }
});
