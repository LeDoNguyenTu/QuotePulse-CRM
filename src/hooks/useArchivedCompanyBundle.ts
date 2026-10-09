import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { functions, type ArchivedLegacyTable } from '../lib/functions';

type ArchiveRow = Record<string, unknown> & { id: string; _archive_cursor: string };

export function useArchivedCompanyBundle(input: { workspaceId: string; archiveId: string; companyId: string; enabled: boolean }) {
  return useQuery({
    queryKey: ['workspace-archive-company-bundle', input.workspaceId, input.archiveId, input.companyId],
    enabled: input.enabled,
    queryFn: () => functions.getArchivedCompanyBundle({
      workspace_id: input.workspaceId,
      archive_id: input.archiveId,
      company_id: input.companyId,
    }),
    refetchInterval: (query) => query.state.data?.status === 'building' ? 500 : false,
  });
}

export function useRestoreArchivedRecord(workspaceId: string, archiveId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ table, row }: { table: ArchivedLegacyTable; row: ArchiveRow }) =>
      functions.restoreWorkspaceArchiveRecord({
        workspace_id: workspaceId,
        archive_id: archiveId,
        table,
        cursor: row._archive_cursor,
        record_id: row.id,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['workspace-archive-browser', workspaceId, archiveId] }),
        queryClient.invalidateQueries({ queryKey: ['workspace-archive-company-bundle', workspaceId, archiveId] }),
        queryClient.invalidateQueries({ queryKey: ['companies'] }),
        queryClient.invalidateQueries({ queryKey: ['contacts'] }),
        queryClient.invalidateQueries({ queryKey: ['deals'] }),
      ]);
    },
  });
}
