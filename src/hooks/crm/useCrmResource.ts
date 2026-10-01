import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { useAuth } from '../useAuth';
import { supabase } from '../../lib/supabase';
import {
  crmListSpec,
  type CrmListFilters,
  type CrmResourceName,
} from '../../lib/crm/resources';
import type { CrmPage } from '../../lib/crm/types';

async function fetchCrmPage<T>(
  resource: CrmResourceName,
  workspaceId: string,
  filters: CrmListFilters,
): Promise<CrmPage<T>> {
  const spec = crmListSpec(resource, workspaceId, filters);
  const { data, error } = await (supabase as any).rpc(spec.rpc, spec.rpcArgs);
  if (error) throw error;
  const result = (data ?? []) as Array<{ row_data: T; total_count: number | string }>;
  return { rows: result.map((item) => item.row_data), count: Number(result[0]?.total_count ?? 0) };
}

export function useCrmPage<T>({
  resource,
  workspaceId,
  filters,
  queryKey,
}: {
  resource: CrmResourceName;
  workspaceId: string;
  filters: CrmListFilters;
  queryKey: QueryKey;
}) {
  return useQuery<CrmPage<T>>({
    queryKey,
    queryFn: () => fetchCrmPage<T>(resource, workspaceId, filters),
    placeholderData: keepPreviousData,
  });
}

export function useCrmMutations<TInput extends object, TRow>({
  resource,
  workspaceId,
  queryRoot,
}: {
  resource: CrmResourceName;
  workspaceId: string;
  queryRoot: QueryKey;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const table = crmListSpec(resource, workspaceId, { page: 1, search: '' }).table;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryRoot });
  const requireUser = () => {
    if (!user) throw new Error('You must be signed in to change CRM records.');
    return user;
  };

  const create = useMutation({
    mutationFn: async (input: TInput) => {
      const activeUser = requireUser();
      const { data, error } = await (supabase as any)
        .from(table)
        .insert({
          ...input,
          workspace_id: workspaceId,
          created_by: activeUser.id,
          updated_by: activeUser.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data as TRow;
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: TInput }) => {
      const activeUser = requireUser();
      const { data, error } = await (supabase as any)
        .from(table)
        .update({ ...input, updated_by: activeUser.id })
        .eq('workspace_id', workspaceId)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as TRow;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      requireUser();
      const { error } = await (supabase as any)
        .from(table)
        .delete()
        .eq('workspace_id', workspaceId)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { create, update, remove };
}
