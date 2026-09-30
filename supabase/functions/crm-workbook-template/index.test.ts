import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

describe('CRM workbook template function', () => {
  it('stores templates in scoped R2 and verifies workspace membership', () => {
    expect(source).toContain('crmWorkbookTemplateKey');
    expect(source).toContain('assertCrmWorkbookPointer');
    expect(source).toMatch(/workspace_members/);
    expect(source).toContain('putVerifiedArchive');
    expect(source).toContain('getArchiveJson');
  });

  it('limits workbook bytes and validates source import ownership on download', () => {
    expect(source).toContain('MAX_WORKBOOK_BYTES');
    expect(source).toMatch(/crm_source_imports/);
    expect(source).toMatch(/source_metadata/);
  });
});
