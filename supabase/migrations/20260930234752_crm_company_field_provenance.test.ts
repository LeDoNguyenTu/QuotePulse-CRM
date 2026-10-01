import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const sql = readFileSync(fileURLToPath(new URL('./20260930234752_crm_company_field_provenance.sql', import.meta.url)), 'utf8');

describe('CRM company field provenance migration', () => {
  it('constrains provenance and marks ordinary edits as user-entered', () => {
    expect(sql).toContain('crm_company_field_sources_valid');
    expect(sql).toContain("'user', 'workbook', 'classifier', 'enrichment', 'legacy'");
    expect(sql).toContain('crm_companies_track_user_sources');
  });

  it('records import provenance without relying on the removed unique activity index', () => {
    expect(sql).toContain("v_row->'company'->'field_sources'");
    expect(sql).toContain('where not exists');
    expect(sql).not.toContain('on conflict (workspace_id, source_import_id, source_row_number, source_column)');
  });
});
