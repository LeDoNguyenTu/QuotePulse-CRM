import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { crmKeys } from '../../lib/crm/queryKeys';
import type { CrmCompany, CrmCompanyInput } from '../../lib/crm/types';
import { collectCrmOptionPages } from '../../lib/crm/options';
import { useCrmMutations, useCrmPage } from './useCrmResource';

export function useCrmCompanies(
  workspaceId: string,
  filters: { page: number; search: string; industry: string; sort: string; sourceImportId?: string },
) {
  return useCrmPage<CrmCompany>({
    resource: 'companies',
    workspaceId,
    filters,
    queryKey: crmKeys.companies(workspaceId, filters),
  });
}

export function useCrmIndustryOptions(workspaceId: string) {
  return useQuery<string[]>({
    queryKey: [...crmKeys.companyRoot(workspaceId), 'industry-options'],
    queryFn: async () => {
      const data = await collectCrmOptionPages<{ industry: string }>(async (from, to) => {
        const { data: page, error } = await (supabase as any)
          .from('crm_companies')
          .select('industry')
          .eq('workspace_id', workspaceId)
          .not('industry', 'is', null)
          .order('industry', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to);
        if (error) throw error;
        return page ?? [];
      });
      return [...new Set<string>(data.map((row) => row.industry.trim()).filter(Boolean))];
    },
  });
}

export function useCrmCompanyOptions(workspaceId: string) {
  return useQuery<Array<Pick<CrmCompany, 'id' | 'name'>>>({
    queryKey: [...crmKeys.companyRoot(workspaceId), 'options'],
    queryFn: async () => {
      return collectCrmOptionPages<Pick<CrmCompany, 'id' | 'name'>>(async (from, to) => {
        const { data, error } = await (supabase as any)
          .from('crm_companies')
          .select('id,name')
          .eq('workspace_id', workspaceId)
          .order('name', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to);
        if (error) throw error;
        return data ?? [];
      });
    },
  });
}

export function useCrmCompanyMutations(workspaceId: string) {
  return useCrmMutations<CrmCompanyInput, CrmCompany>({
    resource: 'companies',
    workspaceId,
    queryRoot: crmKeys.companyRoot(workspaceId),
  });
}
