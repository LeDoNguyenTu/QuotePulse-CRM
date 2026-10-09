import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { functions, type ArchivedLegacyTable } from '../lib/functions';
import { archiveTablePlaceholder, archiveTableQueryKey } from './archiveTablePlaceholder';

export function useArchivedCrmRecords(input: { workspaceId: string; archiveId?: string; table: ArchivedLegacyTable; search: string; cursor?: string; enabled: boolean }) {
  const client = useQueryClient();
  const queryKey = archiveTableQueryKey(input.workspaceId, input.archiveId, input.table, input.search, input.cursor);
  const records = useQuery({
    queryKey,
    enabled: input.enabled && !!input.archiveId,
    placeholderData: (previousData, previousQuery) =>
      archiveTablePlaceholder(previousData, previousQuery?.queryKey, queryKey),
    queryFn: () => functions.browseWorkspaceArchive({ workspace_id: input.workspaceId, archive_id: input.archiveId!, table: input.table, search: input.search, cursor: input.cursor, page_size: 50 }),
  });
  const restore = useMutation({
    mutationFn: (record: { id: string; _archive_cursor: string }) => functions.restoreWorkspaceArchiveRecord({ workspace_id: input.workspaceId, archive_id: input.archiveId!, table: input.table, cursor: record._archive_cursor, record_id: record.id }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['account'] }),
        client.invalidateQueries({ queryKey: ['workspace-archive-browser', input.workspaceId, input.archiveId] }),
      ]);
    },
  });
  return { records, restore };
}
