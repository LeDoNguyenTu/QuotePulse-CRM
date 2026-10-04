import { crmKeys } from '../../lib/crm/queryKeys';
import type { CrmContact, CrmContactInput } from '../../lib/crm/types';
import { useCrmMutations, useCrmPage } from './useCrmResource';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../useAuth';
import { supabase } from '../../lib/supabase';

export function useCrmContacts(
  workspaceId: string,
  filters: {
    page: number; search: string; companyId: string; sort: string; sourceImportId?: string;
    contactState?: string; contactVisibility?: string; duplicateReview?: string;
  },
) {
  return useCrmPage<CrmContact>({
    resource: 'contacts',
    workspaceId,
    filters,
    queryKey: crmKeys.contacts(workspaceId, filters),
  });
}

export function useCrmContactLifecycle(workspaceId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const invalidate = async (contactId?: string) => {
    await queryClient.invalidateQueries({ queryKey: crmKeys.contactRoot(workspaceId) });
    if (contactId) {
      await queryClient.invalidateQueries({ queryKey: ['crm', workspaceId, 'detail', 'contact', contactId] });
    }
  };
  const requireUser = () => {
    if (!user) throw new Error('You must be signed in to change contact lifecycle state.');
    return user;
  };

  const update = useMutation({
    mutationFn: async ({ id, changes }: {
      id: string;
      changes: Partial<Pick<CrmContact, 'record_state' | 'is_hidden' | 'duplicate_review_of'>>;
    }) => {
      const activeUser = requireUser();
      const { data, error } = await (supabase as any).from('crm_contacts')
        .update({ ...changes, updated_by: activeUser.id })
        .eq('workspace_id', workspaceId)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as CrmContact;
    },
    onSuccess: (row) => invalidate(row.id),
  });

  const hideOutdated = useMutation({
    mutationFn: async (input: {
      contactIds?: string[];
      search: string;
      companyId: string;
      sourceImportId?: string;
      duplicateReview?: string;
    }) => {
      requireUser();
      const { data, error } = await (supabase as any).rpc('crm_hide_outdated_contacts', {
        p_workspace_id: workspaceId,
        p_contact_ids: input.contactIds?.length ? input.contactIds : null,
        p_search: input.search.trim(),
        p_company_id: input.companyId || null,
        p_source_import_id: input.sourceImportId || null,
        p_duplicate_review: input.duplicateReview === 'required'
          ? true
          : input.duplicateReview === 'clear'
            ? false
            : null,
      });
      if (error) throw error;
      return Number(data ?? 0);
    },
    onSuccess: () => invalidate(),
  });

  return { update, hideOutdated };
}

export function useCrmContactMutations(workspaceId: string) {
  return useCrmMutations<CrmContactInput, CrmContact>({
    resource: 'contacts',
    workspaceId,
    queryRoot: crmKeys.contactRoot(workspaceId),
  });
}
