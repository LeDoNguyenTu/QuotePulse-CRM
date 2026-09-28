import { describe, expect, it } from 'vitest';
import { normalizeCrmImportRows, validateCrmImportMapping, type CrmImportMapping } from './importPreview';

const mapping: CrmImportMapping = {
  companyName: 'Account', contactEmail: 'Email', contactFirstName: 'First',
  contactLastName: 'Last', dealName: 'Opportunity', dealAmount: 'Value',
  dealCurrency: 'Currency', followUpAt: 'Follow Up',
};

describe('Sales CRM import preview', () => {
  it('requires a mapped company column and rejects missing source headers', () => {
    expect(validateCrmImportMapping({}, ['Account'])).toEqual({ error: 'Map a company name column.' });
    expect(validateCrmImportMapping({ companyName: 'Missing' }, ['Account'])).toEqual({
      error: 'Column "Missing" is not present in this worksheet.',
    });
  });

  it('normalizes CRM rows and classifies existing and in-file duplicates', () => {
    const rows = normalizeCrmImportRows([
      { Account: ' Acme Pte Ltd ', Email: ' ADA@EXAMPLE.COM ', First: 'Ada', Last: 'Lovelace', Opportunity: 'Renewal', Value: '1,200.50', Currency: 'sgd', 'Follow Up': '2026-10-01' },
      { Account: 'ACME PTE LTD', Email: 'ada@example.com', First: '', Last: '', Opportunity: '', Value: '', Currency: '', 'Follow Up': '' },
    ], mapping, {
      companies: [{ id: 'company-1', name: 'Acme Pte Ltd' }],
      contacts: [{ id: 'contact-1', email: 'ada@example.com' }],
    });

    expect(rows[0]).toMatchObject({
      rowNumber: 1,
      valid: true,
      company: { name: 'Acme Pte Ltd' },
      contact: { full_name: 'Ada Lovelace', email: 'ada@example.com' },
      deal: { name: 'Renewal', amount: 1200.5, currency: 'SGD' },
      existingCompanyId: 'company-1',
      existingContactId: 'contact-1',
    });
    expect(rows[1].duplicateOfRow).toBe(1);
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
});
