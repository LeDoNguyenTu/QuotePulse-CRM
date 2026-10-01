import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('./20260930233540_crm_activity_export_destinations.sql', import.meta.url), 'utf8');

describe('CRM activity export destinations migration', () => {
  it('permits multiple activities per workbook cell and links an optional task', () => {
    expect(sql).toMatch(/drop index if exists public\.crm_activities_source_row_column_uidx/i);
    expect(sql).toMatch(/create index[^;]+crm_activities_source_row_column_idx/i);
    expect(sql).toMatch(/add column if not exists activity_id uuid/i);
  });

  it('validates membership, exact record lineage, and mapped activity columns', () => {
    expect(sql).toContain('crm_add_activity_with_destination');
    expect(sql).toMatch(/security invoker/i);
    expect(sql).toContain('crm_source_references');
    expect(sql).toContain("('callLog', 'remarks', 'comments')");
    expect(sql).toContain("errcode = '42501'");
    expect(sql).toContain("errcode = '22023'");
  });
});
