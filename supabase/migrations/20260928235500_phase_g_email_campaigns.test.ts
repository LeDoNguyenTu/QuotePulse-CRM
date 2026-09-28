import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const sql = readFileSync(new URL('./20260928235500_phase_g_email_campaigns.sql', import.meta.url), 'utf8');
describe('Phase G email campaigns migration', () => {
  it('creates workspace-scoped campaigns and recipient snapshots', () => {
    expect(sql).toMatch(/create table public\.crm_email_campaigns/i);
    expect(sql).toMatch(/create table public\.crm_campaign_recipients/i);
    expect(sql).toMatch(/recipient_snapshot jsonb/i);
    expect(sql).toMatch(/workspace_members/i);
    expect(sql).toMatch(/security_invoker = true/i);
  });
  it('queues a deterministic filtered audience through the existing send engine', () => {
    expect(sql).toMatch(/crm_queue_email_campaign/i);
    expect(sql).toMatch(/distinct on \(lower\(btrim\(ct\.email\)\)\)/i);
    expect(sql).toMatch(/email_suppressions/i);
    expect(sql).toMatch(/email_unsubscribe_tokens/i);
    expect(sql).toMatch(/email_sends_sync_campaign_recipient/i);
    expect(sql).toMatch(/security definer set search_path = ''/i);
    expect(sql).toMatch(/5,000 recipient safety limit/i);
    expect(sql).toMatch(/p_consent_confirmed is distinct from true/i);
    expect(sql).toMatch(/coalesce\(p_unsubscribe_base_url, ''\)/i);
    expect(sql).not.toMatch(/grant select, insert, update, delete on table public\.crm_email_campaigns/i);
  });
});
