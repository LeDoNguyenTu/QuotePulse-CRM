import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(new URL('./20260928225500_phase_e_crm_activities.sql', import.meta.url), 'utf8');

describe('Phase E CRM activities migration', () => {
  it('keeps imported activity lineage workspace-scoped and idempotent', () => {
    expect(sql).toMatch(/source_import_id uuid/i);
    expect(sql).toMatch(/foreign key \(workspace_id, source_import_id\)/i);
    expect(sql).toMatch(/unique index crm_activities_source_row_column_uidx/i);
  });

  it('wraps the relational import and creates activities in one transaction', () => {
    expect(sql).toMatch(/crm_commit_import_with_activities/i);
    expect(sql).toMatch(/public\.crm_commit_import\(/i);
    expect(sql).toMatch(/insert into public\.crm_activities/i);
    expect(sql).toMatch(/activity source column is required/i);
    expect(sql).toMatch(/workspace_members/i);
    expect(sql).toMatch(/security invoker/i);
  });

  it('adds an authorized atomic manual activity function', () => {
    expect(sql).toMatch(/crm_add_activity/i);
    expect(sql).toMatch(/p_update_last_call boolean/i);
    expect(sql).toMatch(/update public\.crm_deals/i);
    expect(sql).toMatch(/revoke all .* from public, anon/is);
  });
});
