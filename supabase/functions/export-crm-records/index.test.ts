import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = readFileSync(fileURLToPath(new URL('./index.ts', import.meta.url)), 'utf8');

describe('export-crm-records edge function contract', () => {
  it('authenticates and verifies workspace membership before service-role reads', () => {
    expect(source).toContain('getUserId(req)');
    expect(source).toContain(".from('workspace_members')");
    expect(source).toContain(".eq('workspace_id', workspaceId)");
    expect(source).toContain(".eq('user_id', userId)");
  });

  it('uses entity and column allowlists instead of client-provided table names', () => {
    expect(source).toContain('EXPORT_SCHEMAS');
    expect(source).toContain('Unknown export entity');
    expect(source).toContain('Unknown export column');
    expect(source).not.toContain('.from(body.entity)');
  });

  it('limits selected ids and all-matching rows', () => {
    expect(source).toContain('MAX_EXPORT_ROWS');
    expect(source).toContain('Too many selected records');
    expect(source).toContain('.limit(MAX_EXPORT_ROWS + 1)');
  });

  it('writes columns in the order requested and neutralizes spreadsheet formulas', () => {
    expect(source).toContain('columns.map');
    expect(source).toContain('neutralizeSpreadsheetFormula');
  });
});
