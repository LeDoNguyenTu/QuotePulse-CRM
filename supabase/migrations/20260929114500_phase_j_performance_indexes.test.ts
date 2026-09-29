import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(new URL('./20260929114500_phase_j_performance_indexes.sql', import.meta.url), 'utf8');

describe('Phase J query indexes', () => {
  it('separates company and deal timelines so nullable targets do not block index ordering', () => {
    expect(sql).toMatch(/crm_activities_company_timeline_idx[\s\S]+workspace_id, company_id, occurred_at desc, id/i);
    expect(sql).toMatch(/crm_activities_deal_timeline_idx[\s\S]+workspace_id, deal_id, occurred_at desc, id/i);
  });

  it('matches task, notification, mailbox, campaign, and subject search queries', () => {
    expect(sql).toMatch(/crm_tasks_workspace_due_order_idx[\s\S]+workspace_id, due_at, id/i);
    expect(sql).toMatch(/crm_notifications_workspace_user_status_idx[\s\S]+workspace_id, user_id, status, created_at desc/i);
    expect(sql).toMatch(/crm_mail_messages_workspace_date_idx[\s\S]+workspace_id, message_at desc nulls last, id/i);
    expect(sql).toMatch(/subject extensions\.gin_trgm_ops/i);
    expect(sql).toMatch(/crm_email_campaigns_workspace_created_idx/i);
  });
});
