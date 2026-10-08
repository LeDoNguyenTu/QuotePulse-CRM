import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { functions } from '../lib/functions';
import { supabase } from '../lib/supabase';
import { runWorkspaceArchiveToCompletion } from '../lib/workspaceArchiveRunner';
import { runResumableWorkspaceArchiveAction } from '../lib/workspaceArchiveActionRunner';

export type WorkspaceArchive = {
  id: string;
  status: 'building' | 'verified' | 'failed' | 'deletion_eligible' | 'deleting' | 'deleted';
  restore_status: 'not_started' | 'restoring' | 'verified' | 'failed';
  table_counts: Record<string, number>;
  manifest_key: string | null;
  created_at: string;
  verified_at: string | null;
  deleted_at: string | null;
  last_error: string | null;
};

export type WorkspaceArchiveProgress = {
  table_name: string;
  restore_order: number;
  status: string;
  object_count: number;
  row_count: number;
  deletion_status: 'pending' | 'deleting' | 'deleted' | 'failed';
  deletion_row_count: number;
  deletion_retained_count: number;
};

export function useWorkspaceArchive(workspaceId: string) {
  const client = useQueryClient();
  const stopArchiveAllRef = useRef(false);
  const stopDeletionWorkRef = useRef(false);
  const key = ['workspace-archive', workspaceId];
  const latest = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('workspace_archives')
        .select('id,status,restore_status,table_counts,manifest_key,created_at,verified_at,deleted_at,last_error')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as WorkspaceArchive | null;
    },
  });
  const browsable = useQuery({
    queryKey: ['workspace-archive-browsable', workspaceId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('workspace_archives')
        .select('id,status,restore_status,table_counts,manifest_key,created_at,verified_at,deleted_at,last_error')
        .eq('workspace_id', workspaceId)
        .in('status', ['verified', 'deletion_eligible', 'deleted'])
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
        .select('table_name,restore_order,status,object_count,row_count,deletion_status,deletion_row_count,deletion_retained_count')
        .eq('archive_id', latest.data!.id)
        .order('restore_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as WorkspaceArchiveProgress[];
    },
  });
  const deletionVerification = useQuery({
    queryKey: ['workspace-archive-deletion-verification', workspaceId, latest.data?.id, progress.data?.reduce((sum, table) => sum + Number(table.object_count), 0) ?? 0],
    enabled: !!latest.data?.id,
    queryFn: async () => {
      const { count, error } = await (supabase as any)
        .from('workspace_archive_objects')
        .select('id', { count: 'exact', head: true })
        .eq('archive_id', latest.data!.id)
        .not('deletion_verified_at', 'is', null);
      if (error) throw error;
      return { verified: Number(count ?? 0), total: progress.data?.reduce((sum, table) => sum + Number(table.object_count), 0) ?? 0 };
    },
  });
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: key }),
      client.invalidateQueries({ queryKey: ['workspace-archive-browsable', workspaceId] }),
      client.invalidateQueries({ queryKey: ['workspace-archive-progress', workspaceId] }),
      client.invalidateQueries({ queryKey: ['workspace-archive-deletion-verification', workspaceId] }),
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
  const verifyAllForDeletion = useMutation({
    mutationFn: async () => {
      stopDeletionWorkRef.current = false;
      return runResumableWorkspaceArchiveAction({
        step: () => functions.workspaceArchive({ action: 'dry_run_delete', workspace_id: workspaceId, archive_id: latest.data?.id }),
        isComplete: (result) => result.eligible === true,
        shouldStop: () => stopDeletionWorkRef.current,
        onStep: refresh,
      });
    },
    onSuccess: refresh,
  });
  const deleteAll = useMutation({
    mutationFn: async (confirmation: string) => {
      stopDeletionWorkRef.current = false;
      return runResumableWorkspaceArchiveAction({
        step: () => functions.workspaceArchive({ action: 'delete', workspace_id: workspaceId, archive_id: latest.data?.id, confirmation }),
        isComplete: (result) => result.deleted === true || result.status === 'deleted',
        shouldStop: () => stopDeletionWorkRef.current,
        onStep: refresh,
      });
    },
    onSuccess: refresh,
  });
  const stopDeletionWork = () => { stopDeletionWorkRef.current = true; };
  return { latest, browsable, progress, deletionVerification, archive, archiveAll, stopArchiveAll, restore, dryRunDelete, verifyAllForDeletion, deleteAll, stopDeletionWork };
}
