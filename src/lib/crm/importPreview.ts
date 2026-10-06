import { normalizeDomain, normalizeWebsiteUrl } from './inputs';
import { formatCrmDateForDisplay, parseCrmDate } from './flexibleDate';
import { classifyMissingIndustry, type CompanyFieldSources } from './companyEnrichment';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { inferCustomerStatusFromSource, normalizeImportedCompanyName } from './customerStatusImport';

export interface CrmImportSourceContext {
  filename?: string;
  sheetName?: string;
}

export type CrmImportMapping = Partial<Record<
  | 'companyName' | 'companyIndustry' | 'companyWebsite' | 'companyDomain'
  | 'companyPhone' | 'companyAddress' | 'companyCustomerStatus' | 'sourceRecordCode'
  | 'contactFirstName' | 'contactLastName'
  | 'contactFullName' | 'contactEmail' | 'contactPhone' | 'contactJobTitle'
  | 'contactResigned'
  | 'dealName' | 'dealStage' | 'dealAmount' | 'dealCurrency' | 'dealOwner'
  | 'callOutcome' | 'appointmentStatus'
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
  { key: 'companyCustomerStatus', label: 'Customer status', group: 'Company' },
  { key: 'sourceRecordCode', label: 'Customer code', group: 'Company' },
  { key: 'contactFirstName', label: 'First name', group: 'Contact' },
  { key: 'contactLastName', label: 'Last name', group: 'Contact' },
  { key: 'contactFullName', label: 'Full name', group: 'Contact' },
  { key: 'contactEmail', label: 'Email', group: 'Contact' },
  { key: 'contactPhone', label: 'Phone', group: 'Contact' },
  { key: 'contactJobTitle', label: 'Job title', group: 'Contact' },
  { key: 'contactResigned', label: 'Resigned', group: 'Contact' },
  { key: 'dealName', label: 'Deal name', group: 'Deal' },
  { key: 'dealStage', label: 'Stage', group: 'Deal' },
  { key: 'dealAmount', label: 'Amount', group: 'Deal' },
  { key: 'dealCurrency', label: 'Currency', group: 'Deal' },
  { key: 'dealOwner', label: 'Owner', group: 'Deal' },
  { key: 'callOutcome', label: 'Call outcome', group: 'Deal' },
  { key: 'appointmentStatus', label: 'Appointment status', group: 'Deal' },
  { key: 'lastCallAt', label: 'Last call', group: 'Deal' },
  { key: 'followUpAt', label: 'Follow up', group: 'Deal' },
  { key: 'activityOccurredAt', label: 'Activity date', group: 'Activity' },
  { key: 'callLog', label: 'Call log', group: 'Activity' },
  { key: 'remarks', label: 'Remarks', group: 'Activity' },
  { key: 'comments', label: 'Comments', group: 'Activity' },
];

const CRM_DATE_ROLES = new Set<keyof CrmImportMapping>(['lastCallAt', 'followUpAt', 'activityOccurredAt']);

export function formatCrmImportCell(row: Record<string, unknown>, header: string, mapping: CrmImportMapping): string {
  const value = String(row[header] ?? '').trim();
  if (!value) return '—';
  const role = Object.entries(mapping).find(([, mappedHeader]) => mappedHeader === header)?.[0] as keyof CrmImportMapping | undefined;
  if (!role || !CRM_DATE_ROLES.has(role)) return value;
  const dateSystem = row.__excelDateSystem === '1904' ? '1904' : '1900';
  return formatCrmDateForDisplay(value, dateSystem);
}

const HEADER_ALIASES: Partial<Record<keyof CrmImportMapping, string[]>> = {
  companyName: ['company name', 'customer name', 'company', 'account'],
  companyIndustry: ['industry', 'vertical', 'business sector'],
  companyWebsite: ['website', 'website url', 'company website'],
  companyDomain: ['domain', 'company domain'],
  companyPhone: ['company phone', 'office phone', 'main phone'],
  companyAddress: ['address', 'company address', 'office address'],
  companyCustomerStatus: ['customer status', 'customer type', 'account status'],
  sourceRecordCode: ['customer code', 'account code', 'customer id', 'account id'],
  contactFirstName: ['first name', 'contact first name'],
  contactLastName: ['last name', 'contact last name'],
  contactFullName: ['name', 'contact name', 'full name'],
  contactEmail: ['email address', 'email'],
  contactPhone: ['contact number', 'phone'],
  contactJobTitle: ['designation', 'job title'],
  contactResigned: ['resigned', 'contact resigned', 'former contact'],
  dealName: ['deal name', 'opportunity', 'opportunity name'],
  dealStage: ['deal stage', 'stage'],
  dealAmount: ['deal value', 'deal amount', 'amount', 'value'],
  dealCurrency: ['currency'],
  dealOwner: ['owner', 'deal owner', 'sales owner'],
  callOutcome: ['last call outcome', 'call outcome', 'outcome'],
  appointmentStatus: ['appointment status', 'meeting status'],
  lastCallAt: ['last contact date', 'last call date'],
  followUpAt: ['follow-up date', 'follow up date'],
  activityOccurredAt: ['last contact date', 'activity date'],
  callLog: ['call log'],
  remarks: ['remarks'],
  comments: ['comment', 'comments'],
};

export type CrmHeaderMatchConfidence = 'exact' | 'semantic' | 'source-only';
export interface CrmHeaderMatch {
  header: string;
  role: keyof CrmImportMapping | null;
  label: string | null;
  group: 'Company' | 'Contact' | 'Deal' | 'Activity' | null;
  confidence: CrmHeaderMatchConfidence;
  requiresConfirmation: boolean;
}

const AMBIGUOUS_HEADER_ROLE: Record<string, keyof CrmImportMapping> = {
  'last contact date': 'activityOccurredAt',
};

export function buildCrmHeaderMatches(headers: string[], context: CrmImportSourceContext = {}): CrmHeaderMatch[] {
  const claimed = new Set<keyof CrmImportMapping>();
  return headers.map((header) => {
    const normalized = header.trim().toLowerCase();
    const supportName = normalized === 'name'
      && /support\s+customers?/i.test(context.filename ?? '')
      && /^(active|inactive)\s+customers?$/i.test(context.sheetName ?? '');
    if (supportName) {
      claimed.add('companyName');
      return {
        header, role: 'companyName' as const, label: 'Company name', group: 'Company' as const,
        confidence: 'semantic' as const, requiresConfirmation: false,
      };
    }
    const focusedCompanyPhone = normalized === 'phone'
      && /focused\s+michelle/i.test(context.filename ?? '');
    if (focusedCompanyPhone && !claimed.has('companyPhone')) {
      claimed.add('companyPhone');
      return {
        header, role: 'companyPhone' as const, label: 'Phone', group: 'Company' as const,
        confidence: 'semantic' as const, requiresConfirmation: false,
      };
    }
    const preferred = AMBIGUOUS_HEADER_ROLE[normalized];
    const candidates = CRM_IMPORT_ROLES.filter((role) =>
      !claimed.has(role.key) && HEADER_ALIASES[role.key]?.includes(normalized),
    );
    const role = (preferred && candidates.find((candidate) => candidate.key === preferred))
      ?? candidates.find((candidate) => candidate.label.toLowerCase() === normalized)
      ?? candidates[0];
    if (!role) {
      return {
        header, role: null, label: null, group: null,
        confidence: 'source-only' as const, requiresConfirmation: false,
      };
    }
    claimed.add(role.key);
    const confidence = role.label.toLowerCase() === normalized ? 'exact' as const : 'semantic' as const;
    return {
      header, role: role.key, label: role.label, group: role.group,
      confidence, requiresConfirmation: confidence === 'semantic',
    };
  });
}

export function unconfirmedSemanticHeaders(matches: CrmHeaderMatch[], confirmedHeaders: Set<string>): string[] {
  return matches
    .filter((match) => match.requiresConfirmation && match.role && !confirmedHeaders.has(match.header))
    .map((match) => match.header);
}

export function suggestCrmImportMapping(headers: string[], context: CrmImportSourceContext = {}): CrmImportMapping {
  return Object.fromEntries(buildCrmHeaderMatches(headers, context).flatMap((match) =>
    match.role ? [[match.role, match.header]] : [],
  )) as CrmImportMapping;
}

export interface CrmImportPreviewRow {
  rowNumber: number;
  stableRowFingerprint: string;
  valid: boolean;
  issues: string[];
  warnings: string[];
  duplicateOfRow: number | null;
  existingCompanyId: string | null;
  existingContactId: string | null;
  company: { name: string; industry: string | null; website: string | null; domain: string | null; phone: string | null; address_line_1: string | null; customer_status: string | null; customer_status_review_required: boolean; customer_status_review_reason: string | null; field_sources: CompanyFieldSources };
  contact: { first_name: string | null; last_name: string | null; full_name: string | null; email: string | null; phone: string | null; job_title: string | null; record_state: 'unverified' | 'outdated' } | null;
  deal: { name: string; stage: string; amount: number | null; currency: string; owner_label: string | null; last_call_at: string | null; follow_up_at: string | null; call_outcome: string | null; appointment_status: string | null } | null;
  activities: Array<{ kind: 'note' | 'call'; body: string; occurred_at: string | null; source_column: string; call_outcome: string | null }>;
}

const encoder = new TextEncoder();
function text(value: unknown): string { return typeof value === 'string' ? value.trim() : String(value ?? '').trim(); }
function key(value: string): string { return value.normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toLowerCase(); }
function digits(value: string): string { return value.replace(/\D+/g, ''); }
function fingerprint(value: string): string { return bytesToHex(sha256(encoder.encode(value))); }
function mapped(row: Record<string, unknown>, mapping: CrmImportMapping, role: keyof CrmImportMapping): string {
  const header = mapping[role];
  return header ? text(row[header]) : '';
}
function optional(value: string): string | null { return value || null; }
function dateValue(value: string, label: string, warnings: string[], dateSystem: '1900' | '1904'): string | null {
  if (!value) return null;
  const parsed = parseCrmDate(value, dateSystem);
  if (parsed.kind === 'invalid') {
    warnings.push(`${label} date could not be tracked; the original workbook value will be preserved.`);
    return null;
  }
  if (parsed.kind === 'range') {
    warnings.push(`${label} date range recognized; CRM tracking uses the first date and preserves the full range in the workbook.`);
  }
  return parsed.startIso;
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
  options: CrmImportSourceContext & { customerStatusReview?: ReadonlyMap<string, string> } = {},
): CrmImportPreviewRow[] {
  const companyIds = new Map(existing.companies.map((company) => [key(company.name), company.id]));
  const contactIds = new Map(existing.contacts.filter((contact) => contact.email).map((contact) => [contact.email!.trim().toLowerCase(), contact.id]));
  const seen = new Map<string, number>();

  return rows.map((source, index) => {
    const issues: string[] = [];
    const warnings: string[] = [];
    const sourceRowNumber = typeof source.__sourceRowNumber === 'number' ? source.__sourceRowNumber : index + 2;
    const dateSystem = source.__excelDateSystem === '1904' ? '1904' : '1900';
    const companyName = mapped(source, mapping, 'companyName');
    if (!companyName) issues.push('Company name is required.');
    const websiteText = mapped(source, mapping, 'companyWebsite');
    const website = normalizeWebsiteUrl(websiteText);
    const workbookIndustry = optional(mapped(source, mapping, 'companyIndustry'));
    const classifiedIndustry = classifyMissingIndustry(companyName, workbookIndustry);
    if (websiteText && !website) issues.push('Company website must use http or https.');
    const emailText = mapped(source, mapping, 'contactEmail').toLowerCase();
    if (emailText && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailText)) issues.push('Contact email is invalid.');
    const firstName = mapped(source, mapping, 'contactFirstName');
    const lastName = mapped(source, mapping, 'contactLastName');
    const suppliedFullName = mapped(source, mapping, 'contactFullName');
    const fullName = suppliedFullName || [firstName, lastName].filter(Boolean).join(' ');
    const contactPhone = mapped(source, mapping, 'contactPhone');
    const hasContact = Boolean(firstName || lastName || fullName || emailText || contactPhone || mapped(source, mapping, 'contactJobTitle'));
    const hasContactIdentity = Boolean(fullName || emailText);
    if (hasContact && !hasContactIdentity) {
      warnings.push('Contact fields have no name or email; the original workbook values will be preserved.');
    }

    const dealName = mapped(source, mapping, 'dealName');
    const amountText = mapped(source, mapping, 'dealAmount').replace(/,/g, '');
    const amount = amountText ? Number(amountText) : null;
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) issues.push('Deal amount cannot be negative.');
    const currency = (mapped(source, mapping, 'dealCurrency') || 'SGD').toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) issues.push('Currency must use a three-letter code.');
    const lastCall = dateValue(mapped(source, mapping, 'lastCallAt'), 'Last call', warnings, dateSystem);
    const followUp = dateValue(mapped(source, mapping, 'followUpAt'), 'Follow-up', warnings, dateSystem);
    const activityAt = dateValue(mapped(source, mapping, 'activityOccurredAt'), 'Activity', warnings, dateSystem);
    const callOutcome = optional(mapped(source, mapping, 'callOutcome'));
    const appointmentStatus = optional(mapped(source, mapping, 'appointmentStatus'));
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
      return [{
        kind,
        body: body.slice(0, 20000),
        occurred_at: activityAt,
        source_column: sourceColumn,
        call_outcome: kind === 'call' ? callOutcome : null,
      }];
    });
    const contactIdentity = emailText
      ? `email:${emailText}`
      : fullName
        ? `name:${key(fullName)}`
        : 'no-contact';
    const entityKey = `${key(companyName)}|${contactIdentity}`;
    const duplicateKey = dealName ? `${entityKey}|deal:${key(dealName)}` : entityKey;
    const sourceRecordCode = key(mapped(source, mapping, 'sourceRecordCode'));
    const stableIdentity = sourceRecordCode
      ? `${key(companyName)}|code:${sourceRecordCode}`
      : emailText
        ? `${key(companyName)}|email:${emailText}`
        : fullName && digits(contactPhone)
          ? `${key(companyName)}|contact:${key(fullName)}|phone:${digits(contactPhone)}`
          : dealName
            ? `${key(companyName)}|deal:${key(dealName)}`
            : `${key(companyName)}|company-only`;
    const explicitCustomerStatus = optional(mapped(source, mapping, 'companyCustomerStatus'));
    const statusReviewReason = options.customerStatusReview?.get(normalizeImportedCompanyName(companyName)) ?? null;
    const inferredCustomerStatus = statusReviewReason
      ? null
      : inferCustomerStatusFromSource(options.filename ?? '', options.sheetName ?? '');
    const resignedValue = key(mapped(source, mapping, 'contactResigned'));
    const contactRecordState = ['yes', 'y', 'true', '1', 'resigned'].includes(resignedValue) ? 'outdated' as const : 'unverified' as const;
    const rowIsValid = issues.length === 0;
    const duplicateOfRow = rowIsValid ? seen.get(duplicateKey) ?? null : null;
    if (rowIsValid && companyName) {
      if (!seen.has(entityKey)) seen.set(entityKey, sourceRowNumber);
      if (!seen.has(duplicateKey)) seen.set(duplicateKey, sourceRowNumber);
    }

    return {
      rowNumber: sourceRowNumber,
      stableRowFingerprint: fingerprint(stableIdentity),
      valid: rowIsValid,
      issues,
      warnings,
      duplicateOfRow,
      existingCompanyId: companyIds.get(key(companyName)) ?? null,
      existingContactId: emailText ? contactIds.get(emailText) ?? null : null,
      company: {
        name: companyName,
        industry: classifiedIndustry.value,
        website,
        domain: normalizeDomain(mapped(source, mapping, 'companyDomain')),
        phone: optional(mapped(source, mapping, 'companyPhone')),
        address_line_1: optional(mapped(source, mapping, 'companyAddress')),
        customer_status: explicitCustomerStatus ?? inferredCustomerStatus,
        customer_status_review_required: Boolean(statusReviewReason),
        customer_status_review_reason: statusReviewReason,
        field_sources: {
          name: 'workbook',
          ...(classifiedIndustry.value ? { industry: workbookIndustry ? 'workbook' : 'classifier' } : {}),
          ...(website ? { website: 'workbook' } : {}),
          ...(mapped(source, mapping, 'companyDomain') ? { domain: 'workbook' } : {}),
          ...(mapped(source, mapping, 'companyPhone') ? { phone: 'workbook' } : {}),
          ...(mapped(source, mapping, 'companyAddress') ? { address_line_1: 'workbook' } : {}),
          ...((explicitCustomerStatus ?? inferredCustomerStatus)
            ? { customer_status: explicitCustomerStatus ? 'workbook' : 'classifier' }
            : {}),
        },
      },
      contact: hasContactIdentity ? {
        first_name: optional(firstName), last_name: optional(lastName), full_name: optional(fullName),
        email: optional(emailText), phone: optional(contactPhone),
        job_title: optional(mapped(source, mapping, 'contactJobTitle')),
        record_state: contactRecordState,
      } : null,
      deal: dealName ? {
        name: dealName, stage: mapped(source, mapping, 'dealStage') || 'New',
        amount: Number.isFinite(amount) ? amount : null, currency,
        owner_label: optional(mapped(source, mapping, 'dealOwner')),
        last_call_at: lastCall, follow_up_at: followUp,
        call_outcome: callOutcome, appointment_status: appointmentStatus,
      } : null,
      activities,
    };
  });
}
