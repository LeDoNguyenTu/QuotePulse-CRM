import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import type { CrmActivityInput } from '../../lib/crm/activityInput';
import type { CrmDetailKind } from '../../lib/crm/detailQueries';

export function useCrmActivityMutation(kind: CrmDetailKind, workspaceId: string, recordId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CrmActivityInput) => {
      const { data, error } = await (supabase as any).rpc('crm_add_activity', {
        p_workspace_id: workspaceId,
        p_target_kind: kind,
        p_target_id: recordId,
        p_kind: input.kind,
        p_body: input.body,
        p_occurred_at: input.occurredAt,
        p_update_last_call: input.updateLastCall,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['crm', workspaceId, 'detail', kind, recordId] }),
  });
}
