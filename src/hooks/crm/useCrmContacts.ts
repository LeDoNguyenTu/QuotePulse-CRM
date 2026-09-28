import { crmKeys } from '../../lib/crm/queryKeys';
import type { CrmContact, CrmContactInput } from '../../lib/crm/types';
import { useCrmMutations, useCrmPage } from './useCrmResource';

export function useCrmContacts(
  workspaceId: string,
  filters: { page: number; search: string },
) {
  return useCrmPage<CrmContact>({
    resource: 'contacts',
    workspaceId,
    filters,
    queryKey: crmKeys.contacts(workspaceId, filters),
  });
}

export function useCrmContactMutations(workspaceId: string) {
  return useCrmMutations<CrmContactInput, CrmContact>({
    resource: 'contacts',
    workspaceId,
    queryRoot: crmKeys.contactRoot(workspaceId),
  });
}
