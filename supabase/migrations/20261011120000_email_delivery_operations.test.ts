import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(new URL('./20261011120000_email_delivery_operations.sql', import.meta.url), 'utf8');

describe('email delivery operations migration', () => {
  it('adds an append-only and idempotent retry relationship', () => {
    expect(sql).toMatch(/add column if not exists retry_of_id uuid/i);
    expect(sql).toMatch(/unique index[\s\S]+retry_of_id[\s\S]+where retry_of_id is not null/i);
    expect(sql).toMatch(/select[\s\S]+from public\.email_sends[\s\S]+retry_of_id = p_email_send_id/i);
    expect(sql).toMatch(/insert into public\.email_sends[\s\S]+retry_of_id/i);
    expect(sql).toMatch(/update public\.crm_campaign_recipients[\s\S]+email_send_id = v_retry_id/i);
  });

  it('guards retry by authentication, membership, ownership, definitive failure, and provider result', () => {
    expect(sql).toMatch(/v_user uuid := auth\.uid\(\)/i);
    expect(sql).toMatch(/authentication required/i);
    expect(sql).toMatch(/workspace_members[\s\S]+m\.user_id = v_user/i);
    expect(sql).toMatch(/v_source\.created_by <> v_user/i);
    expect(sql).toMatch(/v_source\.status <> 'failed'/i);
    expect(sql).toMatch(/v_source\.provider_message_id is not null/i);
  });

  it('publishes security-invoker campaign and contact reporting views', () => {
    expect(sql).toMatch(/create (?:or replace )?view public\.crm_campaign_recipient_reporting[\s\S]+security_invoker = true/i);
    expect(sql).toMatch(/create (?:or replace )?view public\.crm_contact_email_history[\s\S]+security_invoker = true/i);
    expect(sql).toMatch(/grant select on public\.crm_campaign_recipient_reporting to authenticated/i);
    expect(sql).toMatch(/grant select on public\.crm_contact_email_history to authenticated/i);
    expect(sql).toMatch(/revoke all on function public\.crm_retry_failed_email_send\(uuid,uuid\) from public, anon/i);
  });

  it('returns the retry id and leaves the original send untouched', () => {
    expect(sql).toMatch(/jsonb_build_object\('email_send_id', v_retry_id, 'status', 'queued'\)/i);
    expect(sql).not.toMatch(/update public\.email_sends[\s\S]+where id = p_email_send_id/i);
  });
});
