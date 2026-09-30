import { crmKeys } from '../../lib/crm/queryKeys';
import type { CrmDeal, CrmDealInput } from '../../lib/crm/types';
import { useCrmMutations, useCrmPage } from './useCrmResource';

export function useCrmDeals(
  workspaceId: string,
  filters: { page: number; search: string; status: string; companyId: string; sort: string; sourceImportId?: string },
) {
  return useCrmPage<CrmDeal>({
    resource: 'deals',
    workspaceId,
    filters,
    queryKey: crmKeys.deals(workspaceId, filters),
  });
}

export function useCrmDealMutations(workspaceId: string) {
  return useCrmMutations<CrmDealInput, CrmDeal>({
    resource: 'deals',
    workspaceId,
    queryRoot: crmKeys.dealRoot(workspaceId),
  });
}
