import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { functions } from '../lib/functions';
import { supabase } from '../lib/supabase';
import { runWorkspaceArchiveToCompletion } from '../lib/workspaceArchiveRunner';

export type WorkspaceArchive = {
  id: string;
  status: 'building' | 'verified' | 'failed' | 'deletion_eligible' | 'deleted';
  restore_status: 'not_started' | 'restoring' | 'verified' | 'failed';
  table_counts: Record<string, number>;
  manifest_key: string | null;
  created_at: string;
  verified_at: string | null;
  last_error: string | null;
};

export type WorkspaceArchiveProgress = {
  table_name: string;
  restore_order: number;
  status: string;
  object_count: number;
  row_count: number;
};

export function useWorkspaceArchive(workspaceId: string) {
  const client = useQueryClient();
  const stopArchiveAllRef = useRef(false);
  const key = ['workspace-archive', workspaceId];
  const latest = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('workspace_archives')
        .select('id,status,restore_status,table_counts,manifest_key,created_at,verified_at,last_error')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as WorkspaceArchive | null;
    },
  });
  const progress = useQuery({
    queryKey: ['workspace-archive-progress', workspaceId, latest.data?.id],
    enabled: !!latest.data?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('workspace_archive_tables')
        .select('table_name,restore_order,status,object_count,row_count')
        .eq('archive_id', latest.data!.id)
        .order('restore_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as WorkspaceArchiveProgress[];
    },
  });
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: key }),
      client.invalidateQueries({ queryKey: ['workspace-archive-progress', workspaceId] }),
    ]);
  };
  const archive = useMutation({
    mutationFn: () => functions.workspaceArchive({ action: 'archive', workspace_id: workspaceId }),
    onSuccess: refresh,
  });
  const archiveAll = useMutation({
    mutationFn: async () => {
      stopArchiveAllRef.current = false;
      return runWorkspaceArchiveToCompletion({
        step: () => functions.workspaceArchive({ action: 'archive', workspace_id: workspaceId }),
        shouldStop: () => stopArchiveAllRef.current,
        onStep: refresh,
      });
    },
    onSuccess: refresh,
  });
  const stopArchiveAll = () => {
    stopArchiveAllRef.current = true;
  };
  const restore = useMutation({
    mutationFn: () => functions.workspaceArchive({ action: 'restore', workspace_id: workspaceId, archive_id: latest.data?.id }),
    onSuccess: refresh,
  });
  const dryRunDelete = useMutation({
    mutationFn: () => functions.workspaceArchive({ action: 'dry_run_delete', workspace_id: workspaceId, archive_id: latest.data?.id }),
    onSuccess: refresh,
  });
  return { latest, progress, archive, archiveAll, stopArchiveAll, restore, dryRunDelete };
}
