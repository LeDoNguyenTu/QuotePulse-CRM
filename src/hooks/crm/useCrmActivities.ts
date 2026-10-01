import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../useAuth';
import type { CrmActivityInput } from '../../lib/crm/activityInput';
import type { CrmDetailKind } from '../../lib/crm/detailQueries';

export function useCrmActivityMutation(kind: CrmDetailKind, workspaceId: string, recordId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CrmActivityInput) => {
      const { data, error } = await (supabase as any).rpc('crm_add_activity_with_destination', {
        p_workspace_id: workspaceId,
        p_target_kind: kind,
        p_target_id: recordId,
        p_kind: input.kind,
        p_body: input.body,
        p_occurred_at: input.occurredAt,
        p_update_last_call: input.updateLastCall,
        p_create_task: input.createTask ?? false,
        p_task_title: input.taskTitle ?? null,
        p_task_due_at: input.taskDueAt ?? null,
        p_task_reminder_at: input.taskReminderAt ?? null,
        p_task_assignee_id: input.taskAssigneeId ?? null,
        p_source_import_id: input.destination?.sourceImportId ?? null,
        p_source_row_number: input.destination?.sourceRowNumber ?? null,
        p_source_column: input.destination?.sourceColumn ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ['crm', workspaceId, 'detail', kind, recordId] }),
      queryClient.invalidateQueries({ queryKey: ['crm', workspaceId, 'tasks'] }),
    ]),
  });
}

export function useWorkspaceMemberOptions(workspaceId: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['crm', workspaceId, 'members'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('crm_list_workspace_members', { p_workspace_id: workspaceId });
      if (error) throw error;
      return (data ?? []).map((member: { user_id: string; role: string }) => ({
        ...member,
        label: member.user_id === user?.id ? `You (${member.role})` : `${member.role} - ${member.user_id.slice(0, 8)}`,
      }));
    },
  });
}
