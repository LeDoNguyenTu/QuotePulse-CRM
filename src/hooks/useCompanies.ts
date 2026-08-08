import { useEffect } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Company, CompanyDashboardRow } from '../lib/types';
import { companyCountKey, companyPageKey, companyRange, normalizedCompanyFilters } from '../lib/companyPagination';
import { accountQueryKey } from '../lib/accountQueryScope';
import { useAuth } from './useAuth';

export interface CompanyFilters {
  search?: string; industry?: string; source_priority?: string; has_quote?: boolean; has_kyc?: boolean; page?: number; pageSize?: number;
}
export interface CompaniesPage { rows: CompanyDashboardRow[]; count: number; }
export const DEFAULT_PAGE_SIZE = 25;

function companyDashboardArgs(filters: CompanyFilters) {
  const normalized = normalizedCompanyFilters(filters);
  return {
    p_search: normalized.search ?? null, p_industry: normalized.industry ?? null,
    p_source_priority: normalized.source_priority ?? null, p_has_quote: normalized.has_quote ?? null,
    p_has_kyc: normalized.has_kyc ?? null,
  };
}

async function fetchCompanyPage(filters: CompanyFilters) {
  const { from } = companyRange(filters.page ?? 0, filters.pageSize ?? DEFAULT_PAGE_SIZE);
  const { data, error } = await (supabase as any).rpc('company_dashboard_page', {
    ...companyDashboardArgs(filters), p_limit: filters.pageSize ?? DEFAULT_PAGE_SIZE, p_offset: from,
  });
  if (error) throw error;
  const rows = (data ?? []) as CompanyDashboardRow[];
  if (!rows.length) return rows;
  const { data: properties, error: propertiesError } = await supabase.from('companies')
    .select('id, hubspot_properties').in('id', rows.map((row) => row.id));
  if (propertiesError) throw propertiesError;
  const byId = new Map((properties ?? []).map((row) => [row.id as string, row.hubspot_properties]));
  return rows.map((row) => ({ ...row, hubspot_properties: byId.get(row.id) ?? {} }));
}

async function fetchCompanyCount(filters: CompanyFilters) {
  const { data: count, error } = await (supabase as any).rpc('company_dashboard_count', companyDashboardArgs(filters));
  if (error) throw error;
  return count ?? 0;
}

export function useCompanies(filters: CompanyFilters) {
  const { user } = useAuth();
  const page = filters.page ?? 0;
  const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;
  const queryClient = useQueryClient();
  const pageQuery = useQuery<CompanyDashboardRow[]>({ queryKey: accountQueryKey(user?.id, companyPageKey(filters)), queryFn: () => fetchCompanyPage(filters), enabled: !!user, placeholderData: keepPreviousData });
  const countQuery = useQuery<number>({ queryKey: accountQueryKey(user?.id, companyCountKey(filters)), queryFn: () => fetchCompanyCount(filters), enabled: !!user, staleTime: 30_000 });
  const pageCount = Math.max(1, Math.ceil((countQuery.data ?? 0) / pageSize));
  useEffect(() => {
    if (!pageQuery.data || countQuery.data == null || page + 1 >= pageCount) return;
    const next = { ...filters, page: page + 1, pageSize };
    void queryClient.prefetchQuery({ queryKey: accountQueryKey(user?.id, companyPageKey(next)), queryFn: () => fetchCompanyPage(next) });
  }, [countQuery.data, filters, page, pageCount, pageQuery.data, pageSize, queryClient, user?.id]);
  return {
    data: pageQuery.data ? { rows: pageQuery.data, count: countQuery.data ?? 0 } as CompaniesPage : undefined,
    pageQuery, countQuery, isLoading: pageQuery.isLoading, isFetching: pageQuery.isFetching,
    isPlaceholderData: pageQuery.isPlaceholderData, error: pageQuery.error,
  };
}

export function useCreateCompany() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: Partial<Company>) => {
      const { data, error } = await supabase.from('companies').insert(input).select().single();
      if (error) throw error;
      return data as Company;
    }, onSuccess: () => qc.invalidateQueries({ queryKey: accountQueryKey(user?.id, []) }),
  });
}

export const TRASH_TTL_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
function invalidateCompanyLists(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['account'] });
}
export function useTrashedCompanies() {
  const { user } = useAuth();
  return useQuery<Company[]>({ queryKey: accountQueryKey(user?.id, ['trashed-companies']), enabled: !!user, queryFn: async () => {
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
  }, onSuccess: () => qc.invalidateQueries({ queryKey: ['account'] }) });
}
