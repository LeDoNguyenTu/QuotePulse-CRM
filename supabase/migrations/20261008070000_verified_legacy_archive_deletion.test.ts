import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(new URL('./20261008070000_verified_legacy_archive_deletion.sql', import.meta.url), 'utf8');

describe('verified legacy archive deletion migration', () => {
  it('adds resumable deletion state and a service-role-only bounded RPC', () => {
    expect(sql).toContain("'deleting', 'deleted'");
    expect(sql).toContain('deletion_row_count');
    expect(sql).toContain('deletion_retained_count');
    expect(sql).toContain('delete_legacy_workspace_archive_batch');
    expect(sql).toContain('least(coalesce(p_batch_size, 5000), 5000)');
    expect(sql).toMatch(/revoke all on function public\.delete_legacy_workspace_archive_batch[\s\S]+authenticated/);
    expect(sql).toMatch(/grant execute on function public\.delete_legacy_workspace_archive_batch[\s\S]+service_role/);
  });

  it('locks the archive version, verifies every object, and deletes in reverse dependency order', () => {
    expect(sql).toContain("archive.status in ('deletion_eligible', 'deleting')");
    expect(sql).toContain('object.deletion_verified_at is null');
    expect(sql).toContain('progress.restore_order desc');
    expect(sql).toContain("set_config('quotepulse.legacy_archive_delete', 'on', true)");
    expect(sql).toContain("set_config('statement_timeout', '30s', true)");
    expect(sql).toContain('for update skip locked');
    expect(sql).toContain('deleted row counts do not reconcile with the verified archive');
    expect(sql).toContain('email_unsubscribe_tokens');
    expect(sql).toContain('crm_campaign_recipients');
    expect(sql).toContain('crm_email_campaigns');
    expect(sql).toContain('protected.contact_id = candidate.id');
    expect(sql).toContain('protected.company_id = candidate.id');
    expect(sql).toContain('protected.template_id = candidate.id');
    expect(sql).toContain('v_total + v_total_retained <> v_expected_total');
  });
});
