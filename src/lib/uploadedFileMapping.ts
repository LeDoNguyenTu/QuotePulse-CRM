export type UploadColumnMapping = Partial<{
  email: string | null;
  companyName: string | null;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  dealName: string | null;
  dealStage: string | null;
  lastActivityDate: string | null;
}>;

export type UploadedMatch = {
  status: 'matched' | 'unmatched' | 'needs_review';
  reason: 'email' | 'company_name' | 'contact_and_company' | null;
  targetType: 'company' | 'contact' | null;
  targetId: string | null;
  companyId: string | null;
};

export type MatchIndexes = {
  contacts: { id: string; email: string | null; fullName?: string | null; companyId: string | null }[];
  companies: { id: string; name: string | null }[];
};

export function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function normalizeName(value: unknown): string {
  return typeof value === 'string'
    ? value.normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toLowerCase().replace(/\s+/g, ' ')
    : '';
}

export function validateUploadMapping(mapping: UploadColumnMapping, headers: string[]) {
  const available = new Set(headers);
  for (const value of Object.values(mapping)) {
    if (value && !available.has(value)) return { error: `Column "${value}" is not present in this file.` };
  }
  return { error: null };
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function matchUploadedRow(
  row: Record<string, unknown>,
  mapping: UploadColumnMapping,
  indexes: MatchIndexes,
): UploadedMatch {
  const email = mapping.email ? normalizeEmail(row[mapping.email]) : '';
  const companyName = mapping.companyName ? normalizeName(row[mapping.companyName]) : '';
  const fullName = mapping.fullName
    ? normalizeName(row[mapping.fullName])
    : normalizeName(`${mapping.firstName ? row[mapping.firstName] ?? '' : ''} ${mapping.lastName ? row[mapping.lastName] ?? '' : ''}`);
  const companies = indexes.companies.filter((company) => normalizeName(company.name) === companyName);
  const contactsByEmail = email ? indexes.contacts.filter((contact) => normalizeEmail(contact.email) === email) : [];
  if (unique(contactsByEmail.map((contact) => contact.id)).length === 1) {
    const contact = contactsByEmail[0];
    return { status: 'matched', reason: 'email', targetType: 'contact', targetId: contact.id, companyId: contact.companyId };
  }
  if (contactsByEmail.length > 1) return { status: 'needs_review', reason: null, targetType: null, targetId: null, companyId: null };
  if (companies.length === 1) {
    return { status: 'matched', reason: 'company_name', targetType: 'company', targetId: companies[0].id, companyId: companies[0].id };
  }
  if (companies.length > 1) return { status: 'needs_review', reason: null, targetType: null, targetId: null, companyId: null };
  if (fullName && companyName) {
    const contacts = indexes.contacts.filter((contact) =>
      normalizeName(contact.fullName) === fullName && contact.companyId && indexes.companies.some((company) => company.id === contact.companyId && normalizeName(company.name) === companyName),
    );
    if (contacts.length === 1) {
      return { status: 'matched', reason: 'contact_and_company', targetType: 'contact', targetId: contacts[0].id, companyId: contacts[0].companyId };
    }
    if (contacts.length > 1) return { status: 'needs_review', reason: null, targetType: null, targetId: null, companyId: null };
  }
  return { status: 'unmatched', reason: null, targetType: null, targetId: null, companyId: null };
}
