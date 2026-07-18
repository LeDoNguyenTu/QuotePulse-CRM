import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Company, CompanyDashboardRow, SourcePriority } from '../lib/types';

export interface CompanyFilters {
  search?: string;
  industry?: string;
  source_priority?: string;
  has_quote?: boolean;
  has_kyc?: boolean;
  page?: number;
  pageSize?: number;
}

export interface CompaniesPage {
  rows: CompanyDashboardRow[];
  count: number;
}

const DEFAULT_PAGE_SIZE = 25;

export function useCompanies(filters: CompanyFilters) {
  const page = filters.page ?? 0;
  const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;

  return useQuery<CompaniesPage>({
    queryKey: ['companies', filters],
    queryFn: async () => {
      let query = supabase
        .from('company_dashboard')
        .select('*', { count: 'exact' });

      if (filters.search && filters.search.trim()) {
        const term = `%${filters.search.trim()}%`;
        // ilike across the dashboard's searchable text columns.
        query = query.or(
          [
            `name_clean.ilike.${term}`,
            `name_raw.ilike.${term}`,
            `industry.ilike.${term}`,
            `primary_contact_name.ilike.${term}`,
            `primary_contact_email.ilike.${term}`,
          ].join(',')
        );
      }
      if (filters.industry) query = query.eq('industry', filters.industry);
      if (filters.source_priority)
        query = query.eq('source_priority', filters.source_priority as SourcePriority);
      if (filters.has_quote) query = query.eq('has_quote', true);
      if (filters.has_kyc) query = query.eq('has_kyc', true);

      const from = page * pageSize;
      const to = from + pageSize - 1;
      // Newest deal activity first — the user should land on the freshest
      // accounts. Companies with no deals (last_deal_at null) fall to the bottom;
      // updated_at breaks ties.
      query = query
        .order('last_deal_at', { ascending: false, nullsFirst: false })
        .order('updated_at', { ascending: false })
        .range(from, to);

      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: (data ?? []) as CompanyDashboardRow[], count: count ?? 0 };
    },
    placeholderData: keepPreviousData,
  });
}

export function useCreateCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Company>) => {
      const { data, error } = await supabase
        .from('companies')
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data as Company;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['companies'] }),
  });
}

// ---------------------------------------------------------------------------
// Recycle bin (soft delete). Deleting a company sets companies.deleted_at so it
// leaves the dashboard but can be restored; a pg_cron job (plus the on-open
// fallback purge below) hard-deletes anything trashed longer than 30 days.
// ---------------------------------------------------------------------------

export const TRASH_TTL_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function invalidateCompanyLists(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['companies'] });
  qc.invalidateQueries({ queryKey: ['trashed-companies'] });
}

export function useTrashedCompanies() {
  return useQuery<Company[]>({
    queryKey: ['trashed-companies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Company[];
    },
  });
}

export function useSoftDeleteCompanies() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from('companies')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => invalidateCompanyLists(qc),
  });
}

export function useRestoreCompanies() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from('companies')
        .update({ deleted_at: null })
        .in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => invalidateCompanyLists(qc),
  });
}

export function useHardDeleteCompanies() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from('companies').delete().in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trashed-companies'] }),
  });
}

// Fallback for when pg_cron isn't enabled: purge companies trashed > 30 days
// ago. Safe to fire when the recycle bin opens (RLS lets authenticated delete).
export function usePurgeExpiredTrash() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const cutoff = new Date(Date.now() - TRASH_TTL_DAYS * DAY_MS).toISOString();
      const { error } = await supabase
        .from('companies')
        .delete()
        .not('deleted_at', 'is', null)
        .lt('deleted_at', cutoff);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trashed-companies'] }),
  });
}
