import { classifyMissingIndustry as classifySharedIndustry } from '../../../supabase/functions/_shared/industry.ts';

export type CompanyFieldSource = 'user' | 'workbook' | 'classifier' | 'enrichment' | 'legacy';
export type CompanyFieldSources = Partial<Record<
  'name' | 'industry' | 'website' | 'domain' | 'phone' | 'address_line_1'
  | 'address_line_2' | 'city' | 'state_region' | 'postal_code' | 'country' | 'customer_status',
  CompanyFieldSource
>>;

export const MAX_COMPANY_ENRICHMENT_IDS = 25;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function classifyMissingIndustry(name: string, current: string | null) {
  return classifySharedIndustry(name, current);
}

export function normalizeCompanyIds(companyIds: string[]): string[] {
  const ids = [...new Set(companyIds.map((value) => value.trim()).filter(Boolean))];
  if (ids.some((value) => !UUID.test(value))) throw new Error('Choose valid company IDs to enrich.');
  return ids.slice(0, MAX_COMPANY_ENRICHMENT_IDS);
}

export function fieldSourceLabel(source: CompanyFieldSource | null | undefined): string {
  return ({
    user: 'User entered', workbook: 'Workbook', classifier: 'Auto-classified',
    enrichment: 'Public enrichment', legacy: 'Existing data',
  } as Record<CompanyFieldSource, string>)[source ?? 'legacy'];
}
