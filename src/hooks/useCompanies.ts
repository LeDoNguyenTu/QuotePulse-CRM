import { useEffect } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Company, CompanyDashboardRow, SourcePriority } from '../lib/types';
import { companyCountKey, companyPageKey, companyRange, companySort, normalizedCompanyFilters } from '../lib/companyPagination';

export interface CompanyFilters {
  search?: string; industry?: string; source_priority?: string; has_quote?: boolean; has_kyc?: boolean; page?: number; pageSize?: number;
}
export interface CompaniesPage { rows: CompanyDashboardRow[]; count: number; }
export const DEFAULT_PAGE_SIZE = 25;
const DASHBOARD_COLUMNS = 'id,name_clean,name_raw,industry,website,source_priority,created_at,updated_at,primary_contact_name,primary_contact_email,primary_contact_phone,products,deal_count,last_deal_at,has_quote,has_kyc,last_email_status,last_email_sent_at';

function applyCompanyFilters(query: any, filters: CompanyFilters) {
  const normalized = normalizedCompanyFilters(filters);
  if (normalized.search) {
    const term = `%${normalized.search}%`;
    query = query.or([`name_clean.ilike.${term}`, `name_raw.ilike.${term}`, `industry.ilike.${term}`, `primary_contact_name.ilike.${term}`, `primary_contact_email.ilike.${term}`].join(','));
  }
  if (normalized.industry) query = query.eq('industry', normalized.industry);
  if (normalized.source_priority) query = query.eq('source_priority', normalized.source_priority as SourcePriority);
  if (normalized.has_quote) query = query.eq('has_quote', true);
  if (normalized.has_kyc) query = query.eq('has_kyc', true);
  return query;
}

async function fetchCompanyPage(filters: CompanyFilters) {
  const { from, to } = companyRange(filters.page ?? 0, filters.pageSize ?? DEFAULT_PAGE_SIZE);
  let query = applyCompanyFilters(supabase.from('company_dashboard').select(DASHBOARD_COLUMNS), filters);
  for (const sort of companySort) query = query.order(sort.column, { ascending: sort.ascending, nullsFirst: sort.nullsFirst });
  const { data, error } = await query.range(from, to);
  if (error) throw error;
  return (data ?? []) as CompanyDashboardRow[];
}

async function fetchCompanyCount(filters: CompanyFilters) {
  const { count, error } = await applyCompanyFilters(supabase.from('company_dashboard').select('id', { count: 'exact', head: true }), filters);
  if (error) throw error;
  return count ?? 0;
}

export function useCompanies(filters: CompanyFilters) {
  const page = filters.page ?? 0;
  const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;
  const queryClient = useQueryClient();
  const pageQuery = useQuery<CompanyDashboardRow[]>({ queryKey: companyPageKey(filters), queryFn: () => fetchCompanyPage(filters), placeholderData: keepPreviousData });
  const countQuery = useQuery<number>({ queryKey: companyCountKey(filters), queryFn: () => fetchCompanyCount(filters), staleTime: 30_000 });
  const pageCount = Math.max(1, Math.ceil((countQuery.data ?? 0) / pageSize));
  useEffect(() => {
    if (!pageQuery.data || countQuery.data == null || page + 1 >= pageCount) return;
    const next = { ...filters, page: page + 1, pageSize };
    void queryClient.prefetchQuery({ queryKey: companyPageKey(next), queryFn: () => fetchCompanyPage(next) });
  }, [countQuery.data, filters, page, pageCount, pageQuery.data, pageSize, queryClient]);
  return {
    data: pageQuery.data ? { rows: pageQuery.data, count: countQuery.data ?? 0 } as CompaniesPage : undefined,
    pageQuery, countQuery, isLoading: pageQuery.isLoading, isFetching: pageQuery.isFetching,
    isPlaceholderData: pageQuery.isPlaceholderData, error: pageQuery.error,
  };
}

export function useCreateCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Company>) => {
      const { data, error } = await supabase.from('companies').insert(input).select().single();
      if (error) throw error;
      return data as Company;
    }, onSuccess: () => qc.invalidateQueries({ queryKey: ['companies'] }),
  });
}

export const TRASH_TTL_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
function invalidateCompanyLists(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['companies'] }); qc.invalidateQueries({ queryKey: ['trashed-companies'] });
}
export function useTrashedCompanies() {
  return useQuery<Company[]>({ queryKey: ['trashed-companies'], queryFn: async () => {
    const { data, error } = await supabase.from('companies').select('*').not('deleted_at', 'is', null).order('deleted_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as Company[];
  }});
}
export function useSoftDeleteCompanies() {
  const qc = useQueryClient(); return useMutation({ mutationFn: async (ids: string[]) => {
    const { error } = await supabase.from('companies').update({ deleted_at: new Date().toISOString() }).in('id', ids); if (error) throw error;
  }, onSuccess: () => invalidateCompanyLists(qc) });
}
export function useRestoreCompanies() {
  const qc = useQueryClient(); return useMutation({ mutationFn: async (ids: string[]) => {
    const { error } = await supabase.from('companies').update({ deleted_at: null }).in('id', ids); if (error) throw error;
  }, onSuccess: () => invalidateCompanyLists(qc) });
}
export function useHardDeleteCompanies() {
  const qc = useQueryClient(); return useMutation({ mutationFn: async (ids: string[]) => {
    const { error } = await supabase.from('companies').delete().in('id', ids); if (error) throw error;
  }, onSuccess: () => { invalidateCompanyLists(qc); } });
}
export function usePurgeExpiredTrash() {
  const qc = useQueryClient(); return useMutation({ mutationFn: async () => {
    const cutoff = new Date(Date.now() - TRASH_TTL_DAYS * DAY_MS).toISOString();
    const { error } = await supabase.from('companies').delete().not('deleted_at', 'is', null).lt('deleted_at', cutoff); if (error) throw error;
  }, onSuccess: () => qc.invalidateQueries({ queryKey: ['trashed-companies'] }) });
}
