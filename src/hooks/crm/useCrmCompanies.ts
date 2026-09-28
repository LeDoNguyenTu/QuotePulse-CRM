import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { crmKeys } from '../../lib/crm/queryKeys';
import type { CrmCompany, CrmCompanyInput } from '../../lib/crm/types';
import { useCrmMutations, useCrmPage } from './useCrmResource';

export function useCrmCompanies(
  workspaceId: string,
  filters: { page: number; search: string; industry: string; sort: string },
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
      const { data, error } = await (supabase as any)
        .from('crm_companies')
        .select('industry')
        .eq('workspace_id', workspaceId)
        .not('industry', 'is', null)
        .order('industry', { ascending: true })
        .limit(1000);
      if (error) throw error;
      return [...new Set<string>((data ?? []).map((row: { industry: string }) => row.industry.trim()).filter(Boolean))];
    },
  });
}

export function useCrmCompanyOptions(workspaceId: string) {
  return useQuery<Array<Pick<CrmCompany, 'id' | 'name'>>>({
    queryKey: [...crmKeys.companyRoot(workspaceId), 'options'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('crm_companies')
        .select('id,name')
        .eq('workspace_id', workspaceId)
        .order('name', { ascending: true })
        .limit(250);
      if (error) throw error;
      return data ?? [];
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
