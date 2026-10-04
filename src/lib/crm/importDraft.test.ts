import { describe, expect, it } from 'vitest';
import * as importDraft from './importDraft';

const { emptyCrmImportDraft } = importDraft;

describe('CRM import draft lifecycle', () => {
  it('returns a fresh empty draft after a completed import', () => {
    const first = emptyCrmImportDraft();
    const second = emptyCrmImportDraft();

    expect(first).toEqual({
      file: null,
      workbook: null,
      sheetIndex: 0,
      mapping: {},
      headerMatches: [],
      confirmedHeaders: new Set(),
      previewPage: 1,
    });
    expect(first.mapping).not.toBe(second.mapping);
    expect(first.headerMatches).not.toBe(second.headerMatches);
    expect(first.confirmedHeaders).not.toBe(second.confirmedHeaders);
  });

  it('uses normalized filename and worksheet identity instead of file contents', () => {
    const buildIdentity = (importDraft as unknown as {
      buildCrmWorkbookIdentity?: (filename: string, sheetName: string) => string;
    }).buildCrmWorkbookIdentity;
    expect(buildIdentity).toBeTypeOf('function');
    if (!buildIdentity) return;

    const original = buildIdentity(' Support Customers.xlsx ', 'Active Customers');
    expect(original).toMatch(/^[a-f0-9]{64}$/);
    expect(buildIdentity('support   customers.XLSX', ' active customers ')).toBe(original);
    expect(buildIdentity('support customers.xlsx', 'Inactive Customers')).not.toBe(original);
  });
});
