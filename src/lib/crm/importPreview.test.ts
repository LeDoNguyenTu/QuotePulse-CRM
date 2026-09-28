import { describe, expect, it } from 'vitest';
import { normalizeCrmImportRows, suggestCrmImportMapping, validateCrmImportMapping, type CrmImportMapping } from './importPreview';

const mapping: CrmImportMapping = {
  companyName: 'Account', contactEmail: 'Email', contactFirstName: 'First',
  contactLastName: 'Last', dealName: 'Opportunity', dealAmount: 'Value',
  dealCurrency: 'Currency', followUpAt: 'Follow Up',
  activityOccurredAt: 'Last Contact', callLog: 'Call Log', remarks: 'Remarks', comments: 'Comments',
};

describe('Sales CRM import preview', () => {
  it('suggests mappings for the real leads workbook activity columns', () => {
    expect(suggestCrmImportMapping(['Last Contact Date', 'Follow-up Date', 'Call Log', 'Company Name', 'Name', 'Remarks', 'Comment'])).toMatchObject({
      companyName: 'Company Name', contactFullName: 'Name', activityOccurredAt: 'Last Contact Date',
      lastCallAt: 'Last Contact Date', followUpAt: 'Follow-up Date', callLog: 'Call Log', remarks: 'Remarks', comments: 'Comment',
    });
  });

  it('preserves physical worksheet rows and the Excel 1904 date system', () => {
    const source: Record<string, unknown> = { Account: 'Acme', When: '1', Notes: 'Called' };
    Object.defineProperties(source, {
      __sourceRowNumber: { value: 4 },
      __excelDateSystem: { value: '1904' },
    });
    const [row] = normalizeCrmImportRows([source], {
      companyName: 'Account', activityOccurredAt: 'When', callLog: 'Notes',
    }, { companies: [], contacts: [] });
    expect(row.rowNumber).toBe(4);
    expect(row.activities[0]).toMatchObject({ occurred_at: '1904-01-02T00:00:00.000Z', source_column: 'Notes' });
  });

  it('reports mapped activity headers that exceed the database provenance limit', () => {
    const header = 'N'.repeat(101);
    const [row] = normalizeCrmImportRows([{ Account: 'Acme', [header]: 'Called' }], {
      companyName: 'Account', callLog: header,
    }, { companies: [], contacts: [] });
    expect(row.valid).toBe(false);
    expect(row.issues).toContain('Call Log source column exceeds 100 characters.');
  });
  it('requires a mapped company column and rejects missing source headers', () => {
    expect(validateCrmImportMapping({}, ['Account'])).toEqual({ error: 'Map a company name column.' });
    expect(validateCrmImportMapping({ companyName: 'Missing' }, ['Account'])).toEqual({
      error: 'Column "Missing" is not present in this worksheet.',
    });
  });

  it('normalizes CRM rows and classifies existing and in-file duplicates', () => {
    const rows = normalizeCrmImportRows([
      { Account: ' Acme Pte Ltd ', Email: ' ADA@EXAMPLE.COM ', First: 'Ada', Last: 'Lovelace', Opportunity: 'Renewal', Value: '1,200.50', Currency: 'sgd', 'Follow Up': '2026-10-01', 'Last Contact': '46293.415277777778', 'Call Log': 'Called buyer', Remarks: 'Warm lead', Comments: 'Send deck' },
      { Account: 'ACME PTE LTD', Email: 'ada@example.com', First: '', Last: '', Opportunity: '', Value: '', Currency: '', 'Follow Up': '' },
    ], mapping, {
      companies: [{ id: 'company-1', name: 'Acme Pte Ltd' }],
      contacts: [{ id: 'contact-1', email: 'ada@example.com' }],
    });

    expect(rows[0]).toMatchObject({
      rowNumber: 2,
      valid: true,
      company: { name: 'Acme Pte Ltd' },
      contact: { full_name: 'Ada Lovelace', email: 'ada@example.com' },
      deal: { name: 'Renewal', amount: 1200.5, currency: 'SGD' },
      activities: [
        expect.objectContaining({ kind: 'call', body: 'Called buyer', source_column: 'Call Log' }),
        expect.objectContaining({ kind: 'note', body: 'Warm lead', source_column: 'Remarks' }),
        expect.objectContaining({ kind: 'note', body: 'Send deck', source_column: 'Comments' }),
      ],
      existingCompanyId: 'company-1',
      existingContactId: 'contact-1',
    });
    expect(rows[0].activities[0].occurred_at).toBe('2026-09-28T09:58:00.000Z');
    expect(rows[1].duplicateOfRow).toBe(2);
  });

  it('reports invalid amounts, dates, and empty company names without throwing', () => {
    const [row] = normalizeCrmImportRows([
      { Account: '', Email: 'not-an-email', Opportunity: 'Bad', Value: '-2', Currency: 'xx', 'Follow Up': 'not-a-date' },
    ], mapping, { companies: [], contacts: [] });
    expect(row.valid).toBe(false);
    expect(row.issues).toEqual(expect.arrayContaining([
      'Company name is required.',
      'Contact email is invalid.',
      'Deal amount cannot be negative.',
      'Currency must use a three-letter code.',
      'Follow-up date is invalid.',
    ]));
  });

  it('never anchors a valid duplicate to an invalid row that will not be committed', () => {
    const rows = normalizeCrmImportRows([
      { Account: 'Acme', Email: 'bad', Opportunity: '', Value: '', Currency: '', 'Follow Up': '' },
      { Account: 'Acme', Email: 'bad', Opportunity: '', Value: '', Currency: '', 'Follow Up': '' },
      { Account: 'Acme', Email: '', Opportunity: '', Value: '', Currency: '', 'Follow Up': '' },
    ], mapping, { companies: [], contacts: [] });
    expect(rows[0].valid).toBe(false);
    expect(rows[1].duplicateOfRow).toBeNull();
    expect(rows[2].valid).toBe(true);
    expect(rows[2].duplicateOfRow).toBeNull();
  });

  it('rejects unsafe company website protocols before import', () => {
    const [row] = normalizeCrmImportRows([
      { Account: 'Acme', Website: 'javascript:alert(1)' },
    ], { companyName: 'Account', companyWebsite: 'Website' }, { companies: [], contacts: [] });

    expect(row.valid).toBe(false);
    expect(row.issues).toContain('Company website must use http or https.');
    expect(row.company.website).toBeNull();
  });
});
