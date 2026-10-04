import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import type { CrmNotification, CrmTask } from '../../lib/crm/types';
import { useAuth } from '../useAuth';
import { collectCrmOptionPages } from '../../lib/crm/options';

export function useCrmTasks(workspaceId: string, options: { includeTasks?: boolean } = {}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const tasks = useQuery({
    queryKey: ['crm', workspaceId, 'tasks'],
    queryFn: async () => {
      return collectCrmOptionPages<CrmTask>(async (from, to) => {
        const { data, error } = await (supabase as any).from('crm_tasks')
          .select('*,company:crm_companies(id,name),contact:crm_contacts(id,full_name),deal:crm_deals(id,name)')
          .eq('workspace_id', workspaceId).order('due_at', { ascending: true, nullsFirst: false }).order('id').range(from, to);
        if (error) throw error;
        return data ?? [];
      });
    },
    enabled: options.includeTasks !== false,
  });
  const notifications = useQuery({
    queryKey: ['crm', workspaceId, 'notifications'],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await (supabase as any).from('crm_notifications')
        .select('*,task:crm_tasks(id,company_id,contact_id,deal_id)')
        .eq('workspace_id', workspaceId).eq('user_id', user.id).eq('status', 'unread')
        .order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return (data ?? []) as CrmNotification[];
    },
    enabled: Boolean(user && workspaceId),
    refetchInterval: 60_000,
  });
  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: CrmTask['status'] }) => {
      if (!user) throw new Error('You must be signed in to update a task.');
      const { error } = await (supabase as any).from('crm_tasks').update({
        status, updated_by: user.id, completed_at: status === 'completed' ? new Date().toISOString() : null,
      }).eq('workspace_id', workspaceId).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ['crm', workspaceId, 'tasks'] }),
      queryClient.invalidateQueries({ queryKey: ['crm', workspaceId, 'notifications'] }),
    ]),
  });
  const markNotificationRead = useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error('You must be signed in to update a reminder.');
      const { error } = await (supabase as any).from('crm_notifications').update({
        status: 'read', read_at: new Date().toISOString(),
      }).eq('workspace_id', workspaceId).eq('user_id', user.id).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['crm', workspaceId, 'notifications'] }),
  });
  const dismissNotification = useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error('You must be signed in to dismiss a reminder.');
      const { error } = await (supabase as any).from('crm_notifications').update({
        status: 'dismissed', read_at: new Date().toISOString(),
      }).eq('workspace_id', workspaceId).eq('user_id', user.id).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['crm', workspaceId, 'notifications'] }),
  });
  return { tasks, notifications, updateStatus, markNotificationRead, dismissNotification };
}
