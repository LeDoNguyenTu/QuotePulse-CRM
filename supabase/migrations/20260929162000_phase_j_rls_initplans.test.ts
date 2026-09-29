import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(new URL('./20260929162000_phase_j_rls_initplans.sql', import.meta.url), 'utf8');

describe('Phase J RLS init-plan optimization', () => {
  it('optimizes all seven post-foundation workspace policies', () => {
    const policies = [
      'crm_email_campaigns_member_select',
      'crm_campaign_recipients_member_select',
      'crm_mailbox_imports_member_select',
      'crm_mail_messages_member_select',
      'crm_mail_message_contacts_member_select',
      'workspace_archive_tables_member_select',
      'workspace_archive_objects_member_select',
    ];
    for (const policy of policies) expect(sql).toContain(`alter policy ${policy}`);
    expect(sql.match(/\(select auth\.uid\(\)\)/g)).toHaveLength(7);
    expect(sql).not.toMatch(/m\.user_id\s*=\s*auth\.uid\(\)/);
  });
});
