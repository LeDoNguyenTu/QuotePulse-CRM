import type { CompanyFilters } from '../hooks/useCompanies';

type FilterKey = Pick<CompanyFilters, 'search' | 'industry' | 'source_priority' | 'has_quote' | 'has_kyc'>;

export const companySort: Array<{ column: string; ascending: boolean; nullsFirst?: boolean }> = [
  { column: 'last_deal_at', ascending: false, nullsFirst: false },
  { column: 'updated_at', ascending: false },
  { column: 'id', ascending: true },
] as const;

export function normalizedCompanyFilters(filters: CompanyFilters): FilterKey {
  return {
    search: filters.search?.trim() || undefined,
    industry: filters.industry || undefined,
    source_priority: filters.source_priority || undefined,
    has_quote: filters.has_quote || undefined,
    has_kyc: filters.has_kyc || undefined,
  };
}

export function companyPageKey(filters: CompanyFilters) {
  return ['company-page', { ...normalizedCompanyFilters(filters), page: filters.page ?? 0, pageSize: filters.pageSize ?? 25 }] as const;
}

export function companyCountKey(filters: CompanyFilters) {
  return ['company-count', normalizedCompanyFilters(filters)] as const;
}

export function companyRange(page: number, pageSize: number) {
  const from = Math.max(0, page) * pageSize;
  return { from, to: from + pageSize - 1 };
}
