import type {
  CrmCompanyInput,
  CrmContactInput,
  CrmDealInput,
  CrmDealStatus,
} from './types';

type InputResult<T> = { ok: true; value: T } | { ok: false; error: string };

function optionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function normalizeDomain(value: unknown): string | null {
  const text = optionalText(value);
  if (!text) return null;
  const withoutProtocol = text.replace(/^https?:\/\//i, '');
  return withoutProtocol.replace(/^www\./i, '').split(/[/?#]/, 1)[0].toLowerCase() || null;
}

export function normalizeWebsiteUrl(value: unknown): string | null {
  const text = optionalText(value);
  if (!text) return null;
  const hasHttpScheme = /^https?:\/\//i.test(text);
  if (/^(?:javascript|data|vbscript|file|mailto|tel):/i.test(text)) return null;
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(text) && !hasHttpScheme) return null;
  try {
    const url = new URL(hasHttpScheme ? text : `https://${text}`);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function normalizeCompanyInput(
  input: Partial<Record<keyof CrmCompanyInput, unknown>>,
): InputResult<CrmCompanyInput> {
  const name = optionalText(input.name);
  if (!name) return { ok: false, error: 'Company name is required.' };
  const websiteText = optionalText(input.website);
  const website = normalizeWebsiteUrl(websiteText);
  if (websiteText && !website) {
    return { ok: false, error: 'Company website must use http or https.' };
  }

  return {
    ok: true,
    value: {
      name,
      industry: optionalText(input.industry),
      website,
      domain: normalizeDomain(input.domain),
      phone: optionalText(input.phone),
      address_line_1: optionalText(input.address_line_1),
      address_line_2: optionalText(input.address_line_2),
      city: optionalText(input.city),
      state_region: optionalText(input.state_region),
      postal_code: optionalText(input.postal_code),
      country: optionalText(input.country),
    },
  };
}

export function normalizeContactInput(
  input: Partial<Record<keyof CrmContactInput, unknown>>,
): InputResult<CrmContactInput> {
  const firstName = optionalText(input.first_name);
  const lastName = optionalText(input.last_name);
  const suppliedFullName = optionalText(input.full_name);
  const derivedFullName = [firstName, lastName].filter(Boolean).join(' ');
  const fullName = suppliedFullName ?? (derivedFullName || null);
  const email = optionalText(input.email)?.toLowerCase() ?? null;
  if (!firstName && !lastName && !fullName && !email) {
    return { ok: false, error: 'Add a contact name or email address.' };
  }
  const recordState = input.record_state;
  if (recordState != null && !['unverified', 'verified', 'outdated'].includes(String(recordState))) {
    return { ok: false, error: 'Choose a valid contact state.' };
  }

  const value: CrmContactInput = {
    company_id: optionalText(input.company_id),
    first_name: firstName,
    last_name: lastName,
    full_name: fullName,
    email,
    phone: optionalText(input.phone),
    job_title: optionalText(input.job_title),
  };
  if ('record_state' in input) value.record_state = recordState as CrmContactInput['record_state'];
  if ('is_hidden' in input && typeof input.is_hidden === 'boolean') value.is_hidden = input.is_hidden;
  if ('duplicate_review_of' in input) value.duplicate_review_of = optionalText(input.duplicate_review_of);

  return {
    ok: true,
    value,
  };
}

export function normalizeDealInput(
  input: Partial<Record<keyof CrmDealInput, unknown>>,
): InputResult<CrmDealInput> {
  const name = optionalText(input.name);
  if (!name) return { ok: false, error: 'Deal name is required.' };

  const amountText = optionalText(input.amount);
  const amount = amountText === null ? null : Number(amountText);
  if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
    return { ok: false, error: 'Deal amount cannot be negative.' };
  }

  const currency = (optionalText(input.currency) ?? 'SGD').toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    return { ok: false, error: 'Currency must use a three-letter code.' };
  }

  const statusText = optionalText(input.status) ?? 'open';
  const statuses: CrmDealStatus[] = ['open', 'won', 'lost', 'on_hold'];
  if (!statuses.includes(statusText as CrmDealStatus)) {
    return { ok: false, error: 'Choose a valid deal status.' };
  }

  return {
    ok: true,
    value: {
      company_id: optionalText(input.company_id),
      name,
      stage: optionalText(input.stage) ?? 'New',
      amount,
      currency,
      status: statusText as CrmDealStatus,
      owner_user_id: optionalText(input.owner_user_id),
      last_call_at: optionalText(input.last_call_at),
      follow_up_at: optionalText(input.follow_up_at),
    },
  };
}
