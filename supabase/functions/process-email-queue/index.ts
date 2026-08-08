// Durable scheduled worker. It never sleeps and is invoked by pg_cron/pg_net.
import { handleOptions, json, errorResponse } from '../_shared/cors.ts';
import { getAdminClient, getUserSettings, type UserSettingsRow } from '../_shared/supabaseAdmin.ts';
import { refreshAccessToken } from '../_shared/ms.ts';
import { safeErrorMessage } from '../_shared/errors.ts';
import { sendBrevo, sendMicrosoftGraph, type EmailProvider } from '../_shared/emailProviders.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';

const BATCH_SIZE = 20;
const MAX_ATTEMPTS = 5;

async function secureEqual(a: string, b: string) {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left[index] ^ right[index];
  return difference === 0;
}

function retryAt(attempt: number, retryAfterSeconds?: number) {
  const seconds = retryAfterSeconds ?? Math.min(3_600, 60 * 2 ** Math.max(0, attempt - 1));
  return new Date(Date.now() + seconds * 1_000).toISOString();
}

function renderTemplate(text: string, vars: Record<string, string | null>) {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => vars[key] || `{{${key}}}`);
}

Deno.serve(async (request) => {
  const preflight = handleOptions(request);
  if (preflight) return preflight;
  const expectedSecret = Deno.env.get('QUEUE_CRON_SECRET');
  const suppliedSecret = request.headers.get('x-queue-cron-secret') ?? '';
  if (!expectedSecret || !(await secureEqual(suppliedSecret, expectedSecret))) return errorResponse('Unauthorized', 401);

  const admin = getAdminClient();
  const { data: claimed, error: claimError } = await admin.rpc('claim_due_email_sends', {
    batch_size: BATCH_SIZE, lease_seconds: 120,
  });
  if (claimError) return json({ ok: false, error: safeErrorMessage(claimError) }, 500);

  const result = { ok: true, processed: 0, sent: 0, retrying: 0, failed: 0, blocked: 0 };
  const tokenByOwner = new Map<string, string>();
  const sentByOwner = new Map<string, number>();
  for (const row of claimed ?? []) {
    result.processed++;
    const ownerId = row.created_by as string;
    try {
      const settings = await getUserSettings(admin, ownerId);
      if (!settings) {
        await finish(admin, row, { status: 'blocked', error_message: 'Owner settings are unavailable.' }); result.blocked++; continue;
      }
      const sentCount = sentByOwner.get(ownerId) ?? await countSentLast24h(admin, ownerId);
      sentByOwner.set(ownerId, sentCount);
      const dailyLimit = settings.daily_send_limit ?? 50;
      if (sentCount >= dailyLimit) {
        await finish(admin, row, { status: 'blocked', error_message: `Daily send limit (${dailyLimit}) reached.` }); result.blocked++; continue;
      }
      const vars = await resolveVars(admin, ownerId, row.company_id, row.to_email);
      const subject = renderTemplate(row.subject ?? '', vars);
      const bodyText = renderTemplate(row.body_rendered ?? '', vars);
      const provider = (row.provider ?? settings.email_provider ?? 'microsoft_graph') as EmailProvider;
      const providerResult = await sendWithProvider(provider, settings, tokenByOwner, ownerId, {
        toEmail: row.to_email, subject, bodyText, senderEmail: settings.brevo_sender_email,
        senderName: settings.brevo_sender_name,
      });
      if (providerResult.ok) {
        await finish(admin, row, { status: 'sent', subject, body_rendered: bodyText, sent_at: new Date().toISOString(),
          provider_message_id: providerResult.providerMessageId, error_message: null, last_error_code: null, error_details: null });
        sentByOwner.set(ownerId, sentCount + 1); result.sent++; continue;
      }
      if (providerResult.retryable && row.attempt_count < MAX_ATTEMPTS) {
        await finish(admin, row, { status: 'retrying', next_attempt_at: retryAt(row.attempt_count, providerResult.retryAfterSeconds),
          error_message: providerResult.errorMessage, last_error_code: providerResult.errorCode }); result.retrying++; continue;
      }
      await finish(admin, row, { status: providerResult.ambiguous ? 'blocked' : 'failed', error_message: providerResult.errorMessage,
        last_error_code: providerResult.errorCode });
      providerResult.ambiguous ? result.blocked++ : result.failed++;
    } catch (error) {
      await finish(admin, row, { status: 'failed', error_message: safeErrorMessage(error) }); result.failed++;
    }
  }
  return json(result);
});

async function sendWithProvider(provider: EmailProvider, settings: UserSettingsRow, tokens: Map<string, string>, ownerId: string, input: Parameters<typeof sendMicrosoftGraph>[1]) {
  if (provider === 'brevo') {
    const apiKey = settings.brevo_api_key?.trim();
    return apiKey
      ? sendBrevo(apiKey, input)
      : { ok: false, providerMessageId: null, retryable: false, ambiguous: false, errorMessage: 'Enter your Brevo API key in Settings.' };
  }
  let token = tokens.get(ownerId);
  if (!token) {
    if (!settings.ms_refresh_token || typeof settings.ms_refresh_token !== 'string') {
      return { ok: false, providerMessageId: null, retryable: false, ambiguous: false, errorMessage: 'Microsoft mailbox is not connected.' };
    }
    const refreshed = await refreshAccessToken(settings.ms_refresh_token);
    token = refreshed.access_token;
    tokens.set(ownerId, token);
  }
  return sendMicrosoftGraph(token, input);
}

async function finish(admin: SupabaseClient, row: Record<string, unknown>, patch: Record<string, unknown>) {
  const { error } = await admin.from('email_sends').update({ ...patch, claimed_at: null, lease_expires_at: null })
    .eq('id', row.id).eq('created_by', row.created_by);
  if (error) throw error;
}

async function resolveVars(admin: SupabaseClient, userId: string, companyId: string | null, toEmail: string) {
  let company_name: string | null = null, industry: string | null = null, contact_name: string | null = null;
  if (companyId) {
    const { data: company } = await admin.from('companies').select('name_clean, industry').eq('id', companyId).eq('owner_id', userId).maybeSingle();
    company_name = company?.name_clean ?? null; industry = company?.industry ?? null;
    const { data: contact } = await admin.from('contacts').select('full_name').eq('company_id', companyId).eq('owner_id', userId).ilike('email', toEmail).maybeSingle();
    contact_name = contact?.full_name ?? null;
  }
  return { company_name, industry, contact_name };
}

async function countSentLast24h(admin: SupabaseClient, userId: string) {
  const { count, error } = await admin.from('email_sends').select('id', { count: 'exact', head: true })
    .eq('created_by', userId).eq('status', 'sent').gte('sent_at', new Date(Date.now() - 86_400_000).toISOString());
  if (error) throw error;
  return count ?? 0;
}
