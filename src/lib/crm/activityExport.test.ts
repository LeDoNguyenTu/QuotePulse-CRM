import { describe, expect, it } from 'vitest';
import { activityDestinationsFromLineage, combineWorkbookActivities } from './activityExport';

describe('CRM activity workbook destinations', () => {
  it('combines assigned activities deterministically newest first', () => {
    expect(combineWorkbookActivities([
      { id: 'b', body: 'Second', occurred_at: '2026-10-01T02:00:00Z' },
      { id: 'a', body: 'First', occurred_at: '2026-10-01T01:00:00Z' },
    ])).toBe('[01 Oct 2026, 10:00 am] Second\n\n[01 Oct 2026, 9:00 am] First');
  });

  it('offers only mapped call, remarks, and comments columns from record lineage', () => {
    expect(activityDestinationsFromLineage([{
      source_row_number: 14,
      source_import: {
        id: 'source-1', database_id: 'CRM-ABC123DEF456', original_filename: 'accounts.xlsx',
        sheet_name: 'Customers', created_at: '2026-10-01T00:00:00Z',
        source_metadata: { mapping: { callLog: 'Call Log', comments: 'Comments', companyName: 'Company' } },
      },
    }])).toEqual([
      { sourceImportId: 'source-1', sourceRowNumber: 14, sourceColumn: 'Call Log', label: 'accounts.xlsx · Row 14 · Call Log' },
      { sourceImportId: 'source-1', sourceRowNumber: 14, sourceColumn: 'Comments', label: 'accounts.xlsx · Row 14 · Comments' },
    ]);
  });
});
