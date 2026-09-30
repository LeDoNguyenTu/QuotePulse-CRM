import { describe, expect, it } from 'vitest';
import { buildWorkbookRowUpdates } from './importExport';

describe('CRM import export values', () => {
  it('writes current CRM values back into the original workbook columns only', () => {
    const updates = buildWorkbookRowUpdates(
      ['Company Name', 'Name', 'Contact Number', 'Call Log', 'Unused'],
      { companyName: 'Company Name', contactFullName: 'Name', contactPhone: 'Contact Number', callLog: 'Call Log' },
      [{
        rowNumber: 2,
        company: { name: 'Updated Co' },
        contact: { full_name: 'New Contact', phone: '9123 4567' },
        deal: null,
        activities: [{ source_column: 'Call Log', body: 'Called again', occurred_at: null }],
      }],
    );

    expect([...updates.get(2)!.entries()]).toEqual([
      [1, 'Updated Co'], [2, 'New Contact'], [3, '9123 4567'], [4, 'Called again'],
    ]);
    expect(updates.get(2)!.has(5)).toBe(false);
  });

  it('leaves the original workbook date untouched when it was not safely parsed', () => {
    const updates = buildWorkbookRowUpdates(
      ['Company Name', 'Last Contact Date'],
      { companyName: 'Company Name', activityOccurredAt: 'Last Contact Date' },
      [{
        rowNumber: 2,
        company: { name: 'Updated Co' },
        contact: null,
        deal: null,
        activities: [{ source_column: 'Call Log', body: 'Called', occurred_at: '2026-09-30T00:00:00Z' }],
      }],
    );

    expect([...updates.get(2)!.entries()]).toEqual([[1, 'Updated Co']]);
  });
});
