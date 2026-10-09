import type { ArchivedLegacyTable } from '../lib/functions';

export type ArchiveTableQueryKey = readonly [
  'workspace-archive-browser',
  workspaceId: string,
  archiveId: string | undefined,
  table: ArchivedLegacyTable,
  search: string,
  cursor: string | undefined,
];

export function archiveTableQueryKey(
  workspaceId: string,
  archiveId: string | undefined,
  table: ArchivedLegacyTable,
  search: string,
  cursor: string | undefined,
): ArchiveTableQueryKey {
  return ['workspace-archive-browser', workspaceId, archiveId, table, search, cursor];
}

export function archiveTablePlaceholder<T>(
  previousData: T | undefined,
  previousQueryKey: readonly unknown[] | undefined,
  currentQueryKey: ArchiveTableQueryKey,
) {
  const sameLedger =
    previousQueryKey?.[0] === currentQueryKey[0]
    && previousQueryKey[1] === currentQueryKey[1]
    && previousQueryKey[2] === currentQueryKey[2]
    && previousQueryKey[3] === currentQueryKey[3];

  return sameLedger ? previousData : undefined;
}
