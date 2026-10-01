export interface ArchiveThenDeleteDependencies<T> {
  putArchive: (payload: T) => Promise<{ key: string; checksum: string }>;
  verifyArchive: (key: string, checksum: string, payload: T) => Promise<void>;
  recordVerified: (
    archive: { key: string; checksum: string },
    payload: T,
  ) => Promise<void>;
  deleteHotRows: () => Promise<void>;
}
export async function archiveThenDelete<T>(
  deps: ArchiveThenDeleteDependencies<T>,
  request: { payload: T },
) {
  const archive = await deps.putArchive(request.payload);
  await deps.verifyArchive(archive.key, archive.checksum, request.payload);
  await deps.recordVerified(archive, request.payload);
  await deps.deleteHotRows();
  return archive;
}
export function recoveryArchiveKey(
  ownerId: string,
  workspaceId: string,
  manifestId: string,
) {
  return `owners/${ownerId}/workspaces/${workspaceId}/crm-recovery/${manifestId}/snapshot.v1.json.gz`;
}
export function assertRecoveryPointer(
  key: string,
  ownerId: string,
  workspaceId: string,
  manifestId: string,
) {
  if (key !== recoveryArchiveKey(ownerId, workspaceId, manifestId))
    throw new Error(
      "Recovery archive pointer is outside the authenticated manifest scope.",
    );
}
