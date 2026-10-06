import { describe, expect, it } from 'vitest';
import { buildCrmHeaderMatches, formatCrmImportCell, normalizeCrmImportRows, suggestCrmImportMapping, unconfirmedSemanticHeaders, validateCrmImportMapping, type CrmImportMapping } from './importPreview';

const mapping: CrmImportMapping = {
  companyName: 'Account', contactEmail: 'Email', contactFirstName: 'First',
  contactLastName: 'Last', dealName: 'Opportunity', dealAmount: 'Value',
  dealCurrency: 'Currency', followUpAt: 'Follow Up',
  activityOccurredAt: 'Last Contact', callLog: 'Call Log', remarks: 'Remarks', comments: 'Comments',
};

describe('Sales CRM import preview', () => {
  it('classifies a missing industry while preserving workbook provenance', () => {
    const [classified] = normalizeCrmImportRows([{ Company: 'SUNLEY M&E ENGINEERING' }], {
      companyName: 'Company',
    }, { companies: [], contacts: [] });
    expect(classified.company.industry).toBe('Engineering');
    expect(classified.company.field_sources.industry).toBe('classifier');

    const [supplied] = normalizeCrmImportRows([{
      Company: 'SUNLEY M&E ENGINEERING', Industry: 'Construction',
    }], { companyName: 'Company', companyIndustry: 'Industry' }, { companies: [], contacts: [] });
    expect(supplied.company.industry).toBe('Construction');
    expect(supplied.company.field_sources.industry).toBe('workbook');
  });

  it('formats mapped date cells without changing ordinary numeric workbook cells', () => {
    const source: Record<string, unknown> = { 'Last Contact Date': '46293.415277777778', Employees: '46293' };
    Object.defineProperty(source, '__excelDateSystem', { value: '1900', enumerable: false });
    expect(formatCrmImportCell(source, 'Last Contact Date', { activityOccurredAt: 'Last Contact Date' })).toBe('28 Sep 2026, 9:58 am');
    expect(formatCrmImportCell(source, 'Employees', { activityOccurredAt: 'Last Contact Date' })).toBe('46293');
  });

  it('reviews source columns in workbook order and requires confirmation for semantic matches', () => {
    const matches = buildCrmHeaderMatches([
      'Company Name', 'Name', 'Contact Number', 'Designation',
      'Last Contact Date', 'Call Log', 'Remarks', 'Comment',
    ]);

    expect(matches.map(({ header, role, confidence }) => ({ header, role, confidence }))).toEqual([
      { header: 'Company Name', role: 'companyName', confidence: 'exact' },
      { header: 'Name', role: 'contactFullName', confidence: 'semantic' },
      { header: 'Contact Number', role: 'contactPhone', confidence: 'semantic' },
      { header: 'Designation', role: 'contactJobTitle', confidence: 'semantic' },
      { header: 'Last Contact Date', role: 'activityOccurredAt', confidence: 'semantic' },
      { header: 'Call Log', role: 'callLog', confidence: 'exact' },
      { header: 'Remarks', role: 'remarks', confidence: 'exact' },
      { header: 'Comment', role: 'comments', confidence: 'semantic' },
    ]);
    expect(matches.some((match) => match.group === 'Deal')).toBe(false);
    expect(matches.filter((match) => match.requiresConfirmation).map((match) => match.header)).toEqual([
      'Name', 'Contact Number', 'Designation', 'Last Contact Date', 'Comment',
    ]);
  });

  it('keeps unknown workbook columns as source-only fields instead of inventing CRM columns', () => {
    expect(buildCrmHeaderMatches(['Company Name', 'Customer Tier'])).toEqual([
      expect.objectContaining({ header: 'Company Name', role: 'companyName' }),
      expect.objectContaining({ header: 'Customer Tier', role: null, confidence: 'source-only' }),
    ]);
  });

  it('blocks only unconfirmed semantic matches', () => {
    const matches = buildCrmHeaderMatches(['Company Name', 'Name', 'Call Log']);
    expect(unconfirmedSemanticHeaders(matches, new Set())).toEqual(['Name']);
    expect(unconfirmedSemanticHeaders(matches, new Set(['Name']))).toEqual([]);
  });

  it('suggests mappings for the real leads workbook activity columns', () => {
    expect(suggestCrmImportMapping(['Last Contact Date', 'Follow-up Date', 'Call Log', 'Company Name', 'Name', 'Remarks', 'Comment'])).toMatchObject({
      companyName: 'Company Name', contactFullName: 'Name', activityOccurredAt: 'Last Contact Date',
      followUpAt: 'Follow-up Date', callLog: 'Call Log', remarks: 'Remarks', comments: 'Comment',
    });
  });

  it('automatically maps common customer workbook headers across CRM groups', () => {
    expect(suggestCrmImportMapping([
      'Company Name', 'Industry', 'Website', 'Address', 'Name', 'Email Address',
      'Contact Number', 'Designation', 'Deal Name', 'Deal Stage', 'Deal Value',
      'Owner', 'Last Contact Date', 'Follow-up Date', 'Call Log', 'Remarks', 'Comments',
    ])).toMatchObject({
      companyName: 'Company Name', companyIndustry: 'Industry', companyWebsite: 'Website',
      companyAddress: 'Address', contactFullName: 'Name', contactEmail: 'Email Address',
      contactPhone: 'Contact Number', contactJobTitle: 'Designation', dealName: 'Deal Name',
      dealStage: 'Deal Stage', dealAmount: 'Deal Value', dealOwner: 'Owner',
      activityOccurredAt: 'Last Contact Date', followUpAt: 'Follow-up Date', callLog: 'Call Log',
      remarks: 'Remarks', comments: 'Comments',
    });
  });

  it('recognizes Customer Name as the company identity in customer databases', () => {
    expect(suggestCrmImportMapping(['Customer Name', 'Name', 'Email'])).toMatchObject({
      companyName: 'Customer Name',
      contactFullName: 'Name',
      contactEmail: 'Email',
    });
  });

  it('treats Phone as a company phone in the supplied focused-company workbook only', () => {
    const focused = { filename: 'June2026_Focused Michelle.xlsx', sheetName: 'Clean Calling List' };
    expect(suggestCrmImportMapping(['Company Name', 'Phone', 'Email'], focused)).toMatchObject({
      companyName: 'Company Name',
      companyPhone: 'Phone',
      contactEmail: 'Email',
    });
    expect(suggestCrmImportMapping(['Company Name', 'Phone'])).toMatchObject({
      contactPhone: 'Phone',
    });
  });

  it('maps NAV, telemarketing, and support-customer workflow columns independently', () => {
    expect(suggestCrmImportMapping([
      'Customer Code', 'Company', 'Designation', 'Resigned', 'Customer Status',
      'Last Call Outcome', 'Appointment Status', 'Deal Stage', 'Follow-up Date', 'Call Log',
    ])).toMatchObject({
      sourceRecordCode: 'Customer Code',
      companyName: 'Company',
      contactJobTitle: 'Designation',
      contactResigned: 'Resigned',
      companyCustomerStatus: 'Customer Status',
      callOutcome: 'Last Call Outcome',
      appointmentStatus: 'Appointment Status',
      dealStage: 'Deal Stage',
      followUpAt: 'Follow-up Date',
      callLog: 'Call Log',
    });
  });

  it('recognizes the Name column as the company name in support-customer tabs', () => {
    const context = { filename: 'Support customers.xlsx', sheetName: 'Active customers' };
    expect(suggestCrmImportMapping(['Name', 'Customer Status', 'AMC Status'], context)).toMatchObject({
      companyName: 'Name',
      companyCustomerStatus: 'Customer Status',
    });
    expect(buildCrmHeaderMatches(['Name'], context)[0]).toMatchObject({
      role: 'companyName',
      requiresConfirmation: false,
    });
    expect(suggestCrmImportMapping(['Name'])).toMatchObject({ contactFullName: 'Name' });
  });

  it('does not auto-assign an ambiguous sheet status and carries a persistent review flag', () => {
    const review = new Map([['sharedandco', 'Name appears in both Active and Inactive customer worksheets.']]);
    const [row] = normalizeCrmImportRows([{ Name: 'Shared & Co.' }], {
      companyName: 'Name',
    }, { companies: [], contacts: [] }, {
      filename: 'Support customers.xlsx',
      sheetName: 'Active customers',
      customerStatusReview: review,
    });

    expect(row.company).toMatchObject({
      customer_status: null,
      customer_status_review_required: true,
      customer_status_review_reason: expect.stringMatching(/active and inactive/i),
    });
  });

  it('auto-assigns a support active customer when no conflict exists', () => {
    const [row] = normalizeCrmImportRows([{ Name: 'Alpha Pte Ltd' }], {
      companyName: 'Name',
    }, { companies: [], contacts: [] }, {
      filename: 'Support customers.xlsx',
      sheetName: 'Active customers',
      customerStatusReview: new Map(),
    });

    expect(row.company).toMatchObject({
      customer_status: 'Maintenance Customer',
      customer_status_review_required: false,
      customer_status_review_reason: null,
    });
  });

  it('builds a stable row fingerprint from business identity instead of row position', () => {
    const [first] = normalizeCrmImportRows([{
      __sourceRowNumber: 2, Company: 'Acme Pte Ltd', Name: 'Ada Lovelace', Phone: '+65 6123 4567', Notes: 'First note',
    }], { companyName: 'Company', contactFullName: 'Name', contactPhone: 'Phone', remarks: 'Notes' }, { companies: [], contacts: [] });
    const [movedAndEdited] = normalizeCrmImportRows([{
      __sourceRowNumber: 99, Company: ' ACME PTE. LTD ', Name: 'ADA LOVELACE', Phone: '65-6123-4567', Notes: 'Updated note',
    }], { companyName: 'Company', contactFullName: 'Name', contactPhone: 'Phone', remarks: 'Notes' }, { companies: [], contacts: [] });

    expect(first.stableRowFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(movedAndEdited.stableRowFingerprint).toBe(first.stableRowFingerprint);
  });

  it('keeps company-only support rows stable when a re-upload moves or reformats the name', () => {
    const [first] = normalizeCrmImportRows([{
      __sourceRowNumber: 12, Name: 'Example Pte. Ltd.', Maintenance: 'Active',
    }], { companyName: 'Name' }, { companies: [], contacts: [] }, {
      filename: 'Support customers.xlsx', sheetName: 'Active customers',
    });
    const [moved] = normalizeCrmImportRows([{
      __sourceRowNumber: 88, Name: ' EXAMPLE PTE LTD ', Maintenance: 'Renewed',
    }], { companyName: 'Name' }, { companies: [], contacts: [] }, {
      filename: 'Support customers.xlsx', sheetName: 'Active customers',
    });

    expect(moved.stableRowFingerprint).toBe(first.stableRowFingerprint);
  });

  it('normalizes lifecycle and pipeline fields without coupling stage to outcomes', () => {
    const [row] = normalizeCrmImportRows([{
      Company: 'Acme', Status: '', Resigned: 'Yes', Outcome: 'Qualified Opportunity',
      Appointment: 'Tentative', Stage: 'Proposal', Deal: 'Renewal', Log: 'Booked a meeting',
    }], {
      companyName: 'Company', companyCustomerStatus: 'Status', contactFullName: 'Company',
      contactResigned: 'Resigned', dealName: 'Deal', dealStage: 'Stage', callOutcome: 'Outcome',
      appointmentStatus: 'Appointment', callLog: 'Log',
    }, { companies: [], contacts: [] }, { sheetName: 'Active Customers' });

    expect(row.company.customer_status).toBe('Current Customer');
    expect(row.contact?.record_state).toBe('outdated');
    expect(row.deal).toMatchObject({
      stage: 'Proposal', call_outcome: 'Qualified Opportunity', appointment_status: 'Tentative',
    });
    expect(row.activities[0]).toMatchObject({ call_outcome: 'Qualified Opportunity' });
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

  it('reports invalid amounts and empty company names without throwing', () => {
    const [row] = normalizeCrmImportRows([
      { Account: '', Email: 'not-an-email', Opportunity: 'Bad', Value: '-2', Currency: 'xx', 'Follow Up': 'not-a-date' },
    ], mapping, { companies: [], contacts: [] });
    expect(row.valid).toBe(false);
    expect(row.issues).toEqual(expect.arrayContaining([
      'Company name is required.',
      'Contact email is invalid.',
      'Deal amount cannot be negative.',
      'Currency must use a three-letter code.',
    ]));
    expect(row.warnings).toContain('Follow-up date could not be tracked; the original workbook value will be preserved.');
  });

  it('keeps rows importable when a user-entered date cannot be parsed', () => {
    const [row] = normalizeCrmImportRows([
      { Account: 'Acme', 'Last Contact': 'late September-ish', 'Call Log': 'Left voicemail' },
    ], { companyName: 'Account', activityOccurredAt: 'Last Contact', callLog: 'Call Log' }, { companies: [], contacts: [] });

    expect(row.valid).toBe(true);
    expect(row.issues).toEqual([]);
    expect(row.warnings).toContain('Activity date could not be tracked; the original workbook value will be preserved.');
    expect(row.activities[0]).toMatchObject({ body: 'Left voicemail', occurred_at: null });
  });

  it('rejects calendar-impossible dates instead of allowing JavaScript rollover', () => {
    const [row] = normalizeCrmImportRows([
      { Account: 'Acme', 'Last Contact': '2026-02-30', 'Call Log': 'Left voicemail' },
    ], { companyName: 'Account', activityOccurredAt: 'Last Contact', callLog: 'Call Log' }, { companies: [], contacts: [] });

    expect(row.valid).toBe(true);
    expect(row.activities[0].occurred_at).toBeNull();
    expect(row.warnings).toContain('Activity date could not be tracked; the original workbook value will be preserved.');
  });

  it('tracks the start of a recognized date range and preserves the full workbook value', () => {
    const [row] = normalizeCrmImportRows([
      { Account: 'Acme', 'Last Contact': '28 Sep 2026 to 30 Sep 2026', 'Call Log': 'Conference follow-up' },
    ], { companyName: 'Account', activityOccurredAt: 'Last Contact', callLog: 'Call Log' }, { companies: [], contacts: [] });

    expect(row.activities[0].occurred_at).toBe('2026-09-28T00:00:00.000Z');
    expect(row.warnings).toContain('Activity date range recognized; CRM tracking uses the first date and preserves the full range in the workbook.');
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

  it('keeps different named contacts at the same company importable when email is blank', () => {
    const rows = normalizeCrmImportRows([
      { Account: 'Advancer Global Ltd', Name: 'Mr Asai' },
      { Account: 'Advancer Global Ltd', Name: 'Kelvin Tong' },
      { Account: 'Advancer Global Ltd', Name: 'Ms Ivy Goh' },
      { Account: 'Advancer Global Ltd', Name: 'Mr Jose' },
    ], { companyName: 'Account', contactFullName: 'Name' }, { companies: [], contacts: [] });

    expect(rows.every((row) => row.valid)).toBe(true);
    expect(rows.map((row) => row.duplicateOfRow)).toEqual([null, null, null, null]);
  });

  it('imports the company and preserves contact-only source cells when no contact identity exists', () => {
    const [row] = normalizeCrmImportRows([
      { Account: 'Acme', Phone: '+65 6123 4567', Designation: 'Accounts' },
    ], {
      companyName: 'Account',
      contactPhone: 'Phone',
      contactJobTitle: 'Designation',
    }, { companies: [], contacts: [] });

    expect(row.valid).toBe(true);
    expect(row.contact).toBeNull();
    expect(row.warnings).toContain('Contact fields have no name or email; the original workbook values will be preserved.');
  });

  it('still identifies repeated named contacts without email as duplicates', () => {
    const rows = normalizeCrmImportRows([
      { Account: 'Acme', Name: 'Ada Lovelace' },
      { Account: 'ACME', Name: ' ada  lovelace ' },
    ], { companyName: 'Account', contactFullName: 'Name' }, { companies: [], contacts: [] });

    expect(rows[1].duplicateOfRow).toBe(2);
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
