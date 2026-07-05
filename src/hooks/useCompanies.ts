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
      query = query.order('updated_at', { ascending: false }).range(from, to);

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
