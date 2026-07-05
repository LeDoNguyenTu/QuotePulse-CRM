// Edge Function: process-email-queue
// Bulk-send worker. Drains queued email_sends via Microsoft Graph, one at a time,
// enforcing:
//   * a hard 2s cooldown floor (Exchange Online ~30 msgs/min),
//   * an app-level daily send cap (user_settings.daily_send_limit),
//   * a wall-time budget so a single invocation always returns; the frontend
//     re-invokes until `done` or `remaining === 0`.
import { handleOptions, json, errorResponse } from '../_shared/cors.ts';
import { getAdminClient, getUserId, getUserSettings } from '../_shared/supabaseAdmin.ts';
import { refreshAccessToken, sendMail } from '../_shared/ms.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';

const MIN_COOLDOWN_MS = 2000; // Exchange Online hard floor.
const TIME_BUDGET_MS = 120_000; // stay under the ~150s function wall-time limit.
const BATCH_FETCH = 100;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function renderTemplate(text: string, vars: Record<string, string | null | undefined>) {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k: string) => {
    const v = vars[k];
    return v == null || v === '' ? `{{${k}}}` : String(v);
  });
}

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  const start = Date.now();
  const errors: string[] = [];
  let processed = 0,
    sent = 0,
    failed = 0,
    blocked = 0;

  try {
    const userId = await getUserId(req);
    const admin = getAdminClient();
    const settings = await getUserSettings(admin, userId);

    if (!settings?.ms_refresh_token) {
      return errorResponse('Microsoft mailbox not connected (Settings).', 400);
    }
    const dailyLimit = settings.daily_send_limit ?? 500;

    // Fresh access token for this invocation (valid ~1h, refreshed per batch).
    let accessToken: string;
    try {
      const tok = await refreshAccessToken(settings.ms_refresh_token);
      accessToken = tok.access_token;
      // Microsoft may rotate the refresh token — persist the new one.
      if (tok.refresh_token && tok.refresh_token !== settings.ms_refresh_token) {
        await admin
          .from('user_settings')
          .update({ ms_refresh_token: tok.refresh_token })
          .eq('user_id', userId);
      }
    } catch (e) {
      return errorResponse(`Microsoft token refresh failed: ${e instanceof Error ? e.message : e}`, 401);
    }

    let sentLast24h = await countSentLast24h(admin, userId);

    const { data: queued, error: qErr } = await admin
      .from('email_sends')
      .select('*')
      .eq('status', 'queued')
      .order('created_at', { ascending: true })
      .limit(BATCH_FETCH);
    if (qErr) throw qErr;

    for (const row of queued ?? []) {
      // Stop if we're out of time; the client will call us again.
      if (Date.now() - start > TIME_BUDGET_MS) break;

      // Daily cap → block the rest of the queue with a clear message.
      if (sentLast24h >= dailyLimit) {
        const { count } = await admin
          .from('email_sends')
          .update({
            status: 'blocked',
            error_message: `Daily send limit (${dailyLimit}) reached.`,
          })
          .eq('status', 'queued')
          .select('id', { count: 'exact', head: true });
        blocked += count ?? 0;
        break;
      }

      processed++;
      try {
        // Resolve render vars from the linked company + contact.
        const vars = await resolveVars(admin, row.company_id, row.to_email);
        const subject = renderTemplate(row.subject ?? '', vars);
        const bodyText = renderTemplate(row.body_rendered ?? '', vars);

        const { requestId } = await sendMail(accessToken, {
          subject,
          bodyText,
          toEmail: row.to_email,
        });

        await admin
          .from('email_sends')
          .update({
            status: 'sent',
            subject,
            body_rendered: bodyText,
            provider_message_id: requestId,
            sent_at: new Date().toISOString(),
            created_by: userId,
            error_message: null,
          })
          .eq('id', row.id);

        sent++;
        sentLast24h++;
      } catch (e) {
        failed++;
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`send ${row.id}: ${msg}`);
        await admin
          .from('email_sends')
          .update({ status: 'failed', error_message: msg, created_by: userId })
          .eq('id', row.id);
      }

      // Cooldown before the next send (enforced floor).
      const cooldownMs = Math.max(MIN_COOLDOWN_MS, (row.cooldown_seconds ?? 2) * 1000);
      if (Date.now() - start < TIME_BUDGET_MS) await sleep(cooldownMs);
    }

    const remaining = await countQueued(admin);

    return json({
      ok: true,
      processed,
      sent,
      failed,
      blocked,
      remaining,
      sent_last_24h: sentLast24h,
      daily_limit: dailyLimit,
      done: remaining === 0,
      errors,
    });
  } catch (e) {
    return json(
      {
        ok: false,
        processed,
        sent,
        failed,
        blocked,
        remaining: -1,
        done: false,
        errors: [...errors, e instanceof Error ? e.message : String(e)],
      },
      500
    );
  }
});

async function resolveVars(
  admin: SupabaseClient,
  companyId: string | null,
  toEmail: string
): Promise<Record<string, string | null>> {
  let company_name: string | null = null;
  let industry: string | null = null;
  let contact_name: string | null = null;

  if (companyId) {
    const { data: company } = await admin
      .from('companies')
      .select('name_clean, industry')
      .eq('id', companyId)
      .maybeSingle();
    company_name = company?.name_clean ?? null;
    industry = company?.industry ?? null;

    const { data: contact } = await admin
      .from('contacts')
      .select('full_name')
      .eq('company_id', companyId)
      .ilike('email', toEmail)
      .maybeSingle();
    contact_name = contact?.full_name ?? null;
  }
  return { company_name, industry, contact_name };
}

async function countSentLast24h(admin: SupabaseClient, userId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from('email_sends')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'sent')
    .eq('created_by', userId)
    .gte('sent_at', since);
  return count ?? 0;
}

async function countQueued(admin: SupabaseClient): Promise<number> {
  const { count } = await admin
    .from('email_sends')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'queued');
  return count ?? 0;
}
