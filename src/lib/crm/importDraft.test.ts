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

  it('preserves every source row in the revision index even when normalization skips a row', () => {
    const buildSourceRows = (importDraft as unknown as {
      buildCrmSourceRows?: (sheet: {
        headers: string[];
        rows: Array<Record<string, unknown>>;
      }) => Array<{ row_number: number; cells: Record<string, string> }>;
    }).buildCrmSourceRows;
    expect(buildSourceRows).toBeTypeOf('function');
    if (!buildSourceRows) return;
    const first = { Company: 'Acme', Email: 'valid@example.com' };
    const second = { Company: '', Email: 'invalid' };
    Object.defineProperty(first, '__sourceRowNumber', { value: 2 });
    Object.defineProperty(second, '__sourceRowNumber', { value: 3 });

    expect(buildSourceRows({ headers: ['Company', 'Email'], rows: [first, second] })).toEqual([
      { row_number: 2, cells: { Company: 'Acme', Email: 'valid@example.com' } },
      { row_number: 3, cells: { Company: '', Email: 'invalid' } },
    ]);
  });
});
