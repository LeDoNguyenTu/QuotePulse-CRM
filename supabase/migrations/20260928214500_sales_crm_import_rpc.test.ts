import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(new URL('./20260928214500_sales_crm_import_rpc.sql', import.meta.url), 'utf8');

describe('Sales CRM import RPC migration', () => {
  it('defines an authenticated security-invoker transaction with membership and bounds checks', () => {
    expect(sql).toMatch(/create or replace function public\.crm_commit_import/i);
    expect(sql).toMatch(/security invoker/i);
    expect(sql).not.toMatch(/security definer/i);
    expect(sql).toMatch(/set search_path = ''/i);
    expect(sql).toMatch(/workspace_members/i);
    expect(sql).toMatch(/jsonb_array_length\(p_rows\).*20000/is);
    expect(sql).toMatch(/p_source_row_count integer/i);
    expect(sql).toMatch(/'skipped_invalid_rows'/i);
    expect(sql).toMatch(/pg_advisory_xact_lock/i);
    expect(sql).toMatch(/grant execute on function public\.crm_commit_import/i);
  });

  it('creates import metadata, normalized records, and row lineage', () => {
    expect(sql).toMatch(/insert into public\.crm_source_imports/i);
    expect(sql).toMatch(/insert into public\.crm_companies/i);
    expect(sql).toMatch(/insert into public\.crm_contacts/i);
    expect(sql).toMatch(/insert into public\.crm_deals/i);
    expect((sql.match(/insert into public\.crm_source_references/gi) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('does not grant anonymous or public execution', () => {
    expect(sql).toMatch(/revoke all on function public\.crm_commit_import.*from public, anon/is);
    expect(sql).not.toMatch(/grant execute.*to anon/i);
  });
});
