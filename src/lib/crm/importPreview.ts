import { normalizeDomain, normalizeWebsiteUrl } from './inputs';

export type CrmImportMapping = Partial<Record<
  | 'companyName' | 'companyIndustry' | 'companyWebsite' | 'companyDomain'
  | 'companyPhone' | 'companyAddress' | 'contactFirstName' | 'contactLastName'
  | 'contactFullName' | 'contactEmail' | 'contactPhone' | 'contactJobTitle'
  | 'dealName' | 'dealStage' | 'dealAmount' | 'dealCurrency' | 'dealOwner'
  | 'lastCallAt' | 'followUpAt' | 'activityOccurredAt' | 'callLog' | 'remarks' | 'comments',
  string | null
>>;

export const CRM_IMPORT_ROLES: Array<{ key: keyof CrmImportMapping; label: string; group: 'Company' | 'Contact' | 'Deal' | 'Activity' }> = [
  { key: 'companyName', label: 'Company name', group: 'Company' },
  { key: 'companyIndustry', label: 'Industry', group: 'Company' },
  { key: 'companyWebsite', label: 'Website', group: 'Company' },
  { key: 'companyDomain', label: 'Domain', group: 'Company' },
  { key: 'companyPhone', label: 'Phone', group: 'Company' },
  { key: 'companyAddress', label: 'Address', group: 'Company' },
  { key: 'contactFirstName', label: 'First name', group: 'Contact' },
  { key: 'contactLastName', label: 'Last name', group: 'Contact' },
  { key: 'contactFullName', label: 'Full name', group: 'Contact' },
  { key: 'contactEmail', label: 'Email', group: 'Contact' },
  { key: 'contactPhone', label: 'Phone', group: 'Contact' },
  { key: 'contactJobTitle', label: 'Job title', group: 'Contact' },
  { key: 'dealName', label: 'Deal name', group: 'Deal' },
  { key: 'dealStage', label: 'Stage', group: 'Deal' },
  { key: 'dealAmount', label: 'Amount', group: 'Deal' },
  { key: 'dealCurrency', label: 'Currency', group: 'Deal' },
  { key: 'dealOwner', label: 'Owner', group: 'Deal' },
  { key: 'lastCallAt', label: 'Last call', group: 'Deal' },
  { key: 'followUpAt', label: 'Follow up', group: 'Deal' },
  { key: 'activityOccurredAt', label: 'Activity date', group: 'Activity' },
  { key: 'callLog', label: 'Call log', group: 'Activity' },
  { key: 'remarks', label: 'Remarks', group: 'Activity' },
  { key: 'comments', label: 'Comments', group: 'Activity' },
];

const HEADER_ALIASES: Partial<Record<keyof CrmImportMapping, string[]>> = {
  companyName: ['company name', 'company', 'account'],
  contactFullName: ['name', 'contact name', 'full name'],
  contactEmail: ['email address', 'email'],
  contactPhone: ['contact number', 'phone'],
  contactJobTitle: ['designation', 'job title'],
  lastCallAt: ['last contact date', 'last call date'],
  followUpAt: ['follow-up date', 'follow up date'],
  activityOccurredAt: ['last contact date', 'activity date'],
  callLog: ['call log'],
  remarks: ['remarks'],
  comments: ['comment', 'comments'],
};

export function suggestCrmImportMapping(headers: string[]): CrmImportMapping {
  const normalized = new Map(headers.map((header) => [header.trim().toLowerCase(), header]));
  return Object.fromEntries(Object.entries(HEADER_ALIASES).flatMap(([role, aliases]) => {
    const header = aliases?.map((alias) => normalized.get(alias)).find(Boolean);
    return header ? [[role, header]] : [];
  })) as CrmImportMapping;
}

export interface CrmImportPreviewRow {
  rowNumber: number;
  valid: boolean;
  issues: string[];
  duplicateOfRow: number | null;
  existingCompanyId: string | null;
  existingContactId: string | null;
  company: { name: string; industry: string | null; website: string | null; domain: string | null; phone: string | null; address_line_1: string | null };
  contact: { first_name: string | null; last_name: string | null; full_name: string | null; email: string | null; phone: string | null; job_title: string | null } | null;
  deal: { name: string; stage: string; amount: number | null; currency: string; owner_label: string | null; last_call_at: string | null; follow_up_at: string | null } | null;
  activities: Array<{ kind: 'note' | 'call'; body: string; occurred_at: string | null; source_column: string }>;
}

function text(value: unknown): string { return typeof value === 'string' ? value.trim() : String(value ?? '').trim(); }
function key(value: string): string { return value.normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toLowerCase(); }
function mapped(row: Record<string, unknown>, mapping: CrmImportMapping, role: keyof CrmImportMapping): string {
  const header = mapping[role];
  return header ? text(row[header]) : '';
}
function optional(value: string): string | null { return value || null; }
function dateValue(value: string, label: string, issues: string[], dateSystem: '1900' | '1904'): string | null {
  if (!value) return null;
  const serial = /^\d{1,7}(?:\.\d+)?$/.test(value) ? Number(value) : null;
  const date = serial !== null && serial > 0 && serial < 2958466
    ? new Date((dateSystem === '1904' ? Date.UTC(1904, 0, 1) : -25569 * 86_400_000) + serial * 86_400_000)
    : new Date(value);
  if (Number.isNaN(date.getTime())) { issues.push(`${label} date is invalid.`); return null; }
  return date.toISOString();
}

export function validateCrmImportMapping(mapping: CrmImportMapping, headers: string[]): { error: string | null } {
  if (!mapping.companyName) return { error: 'Map a company name column.' };
  const available = new Set(headers);
  for (const header of Object.values(mapping)) {
    if (header && !available.has(header)) return { error: `Column "${header}" is not present in this worksheet.` };
  }
  return { error: null };
}

export function normalizeCrmImportRows(
  rows: Record<string, unknown>[],
  mapping: CrmImportMapping,
  existing: { companies: Array<{ id: string; name: string }>; contacts: Array<{ id: string; email: string | null }> },
): CrmImportPreviewRow[] {
  const companyIds = new Map(existing.companies.map((company) => [key(company.name), company.id]));
  const contactIds = new Map(existing.contacts.filter((contact) => contact.email).map((contact) => [contact.email!.trim().toLowerCase(), contact.id]));
  const seen = new Map<string, number>();

  return rows.map((source, index) => {
    const issues: string[] = [];
    const sourceRowNumber = typeof source.__sourceRowNumber === 'number' ? source.__sourceRowNumber : index + 2;
    const dateSystem = source.__excelDateSystem === '1904' ? '1904' : '1900';
    const companyName = mapped(source, mapping, 'companyName');
    if (!companyName) issues.push('Company name is required.');
    const websiteText = mapped(source, mapping, 'companyWebsite');
    const website = normalizeWebsiteUrl(websiteText);
    if (websiteText && !website) issues.push('Company website must use http or https.');
    const emailText = mapped(source, mapping, 'contactEmail').toLowerCase();
    if (emailText && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailText)) issues.push('Contact email is invalid.');
    const firstName = mapped(source, mapping, 'contactFirstName');
    const lastName = mapped(source, mapping, 'contactLastName');
    const suppliedFullName = mapped(source, mapping, 'contactFullName');
    const fullName = suppliedFullName || [firstName, lastName].filter(Boolean).join(' ');
    const hasContact = Boolean(firstName || lastName || fullName || emailText || mapped(source, mapping, 'contactPhone') || mapped(source, mapping, 'contactJobTitle'));
    if (hasContact && !fullName && !emailText) issues.push('Contact needs a name or email.');

    const dealName = mapped(source, mapping, 'dealName');
    const amountText = mapped(source, mapping, 'dealAmount').replace(/,/g, '');
    const amount = amountText ? Number(amountText) : null;
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) issues.push('Deal amount cannot be negative.');
    const currency = (mapped(source, mapping, 'dealCurrency') || 'SGD').toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) issues.push('Currency must use a three-letter code.');
    const lastCall = dateValue(mapped(source, mapping, 'lastCallAt'), 'Last call', issues, dateSystem);
    const followUp = dateValue(mapped(source, mapping, 'followUpAt'), 'Follow-up', issues, dateSystem);
    const activityAt = dateValue(mapped(source, mapping, 'activityOccurredAt'), 'Activity', issues, dateSystem);
    const activityValues = [
      { role: 'callLog' as const, kind: 'call' as const, label: 'Call Log' },
      { role: 'remarks' as const, kind: 'note' as const, label: 'Remarks' },
      { role: 'comments' as const, kind: 'note' as const, label: 'Comments' },
    ];
    const activities = activityValues.flatMap(({ role, kind, label }) => {
      const body = mapped(source, mapping, role);
      if (!body) return [];
      const sourceColumn = mapping[role] ?? label;
      if (sourceColumn.length > 100) issues.push(`${label} source column exceeds 100 characters.`);
      if (body.length > 20000) issues.push(`${label} exceeds 20,000 characters.`);
      return [{ kind, body: body.slice(0, 20000), occurred_at: activityAt, source_column: sourceColumn }];
    });
    const duplicateKey = `${key(companyName)}|${emailText}`;
    const rowIsValid = issues.length === 0;
    const duplicateOfRow = rowIsValid ? seen.get(duplicateKey) ?? null : null;
    if (rowIsValid && companyName && !seen.has(duplicateKey)) seen.set(duplicateKey, sourceRowNumber);

    return {
      rowNumber: sourceRowNumber,
      valid: rowIsValid,
      issues,
      duplicateOfRow,
      existingCompanyId: companyIds.get(key(companyName)) ?? null,
      existingContactId: emailText ? contactIds.get(emailText) ?? null : null,
      company: {
        name: companyName,
        industry: optional(mapped(source, mapping, 'companyIndustry')),
        website,
        domain: normalizeDomain(mapped(source, mapping, 'companyDomain')),
        phone: optional(mapped(source, mapping, 'companyPhone')),
        address_line_1: optional(mapped(source, mapping, 'companyAddress')),
      },
      contact: hasContact ? {
        first_name: optional(firstName), last_name: optional(lastName), full_name: optional(fullName),
        email: optional(emailText), phone: optional(mapped(source, mapping, 'contactPhone')),
        job_title: optional(mapped(source, mapping, 'contactJobTitle')),
      } : null,
      deal: dealName ? {
        name: dealName, stage: mapped(source, mapping, 'dealStage') || 'New',
        amount: Number.isFinite(amount) ? amount : null, currency,
        owner_label: optional(mapped(source, mapping, 'dealOwner')),
        last_call_at: lastCall, follow_up_at: followUp,
      } : null,
      activities,
    };
  });
}
