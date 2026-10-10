import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { functions } from '../../lib/functions';
import { supabase } from '../../lib/supabase';

export function useCrmOperations(workspaceId: string) {
  return useQuery({ queryKey: ['crm', workspaceId, 'provider-status'], queryFn: () => functions.providerStatus(workspaceId), staleTime: 60_000 });
}

export function useSaveProviderBudget(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ provider, limit, resetAt }: { provider: 'serper' | 'nvidia'; limit: number | null; resetAt: string | null }) => {
      const { error } = await (supabase as any).from('provider_budget_settings').upsert({ workspace_id: workspaceId, provider, budget_units: limit, reset_at: resetAt }, { onConflict: 'workspace_id,owner_id,provider' });
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['crm', workspaceId, 'provider-status'] }),
  });
}
