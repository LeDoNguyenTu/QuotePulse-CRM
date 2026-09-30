import { describe, expect, it } from 'vitest';
import {
  IMPORT_PREVIEW_PAGE_SIZE,
  autoFitImportColumnWidths,
  mergeImportColumnWidths,
  paginateImportRows,
  parseImportColumnWidths,
} from './importTableLayout';

describe('CRM import table layout', () => {
  it('limits each workbook preview page to fifteen rows', () => {
    expect(IMPORT_PREVIEW_PAGE_SIZE).toBe(15);
    const rows = Array.from({ length: 32 }, (_, index) => index + 1);
    expect(paginateImportRows(rows, 2)).toEqual(rows.slice(15, 30));
    expect(paginateImportRows(rows, 3)).toEqual([31, 32]);
  });

  it('gives content-heavy columns more room while keeping widths bounded', () => {
    const widths = autoFitImportColumnWidths(
      ['Last Contact Date', 'Name', 'Call Log'],
      [{
        'Last Contact Date': '28 Sep 2026, 9:58 am',
        Name: 'Ada Wong',
        'Call Log': 'Discussed the current finance workflow, migration constraints, stakeholders, and next follow-up actions.',
      }],
    );

    expect(widths['Call Log']).toBeGreaterThan(widths.Name);
    expect(widths['Last Contact Date']).toBeGreaterThanOrEqual(160);
    expect(widths['Call Log']).toBeLessThanOrEqual(480);
  });

  it('restores valid manual widths and ignores unrelated or malformed values', () => {
    expect(mergeImportColumnWidths(
      ['Name', 'Call Log'],
      { Name: 160, 'Call Log': 420 },
      { Name: 280, 'Call Log': 9999, Unknown: 300, Broken: Number.NaN },
    )).toEqual({ Name: 280, 'Call Log': 640 });
    expect(parseImportColumnWidths('{"Name":260,"Broken":"wide"}')).toEqual({ Name: 260 });
    expect(parseImportColumnWidths('not-json')).toEqual({});
  });
});
