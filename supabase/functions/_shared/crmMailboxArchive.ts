export interface MailboxArchiveChunk {
  key: string;
  checksum: string;
  count: number;
}

export function mailboxArchivePrefix(ownerId: string, workspaceId: string, importId: string): string {
  return `owners/${ownerId}/workspaces/${workspaceId}/crm-mailboxes/${importId}/`;
}

export function mailboxArchiveKey(ownerId: string, workspaceId: string, importId: string): string {
  return `${mailboxArchivePrefix(ownerId, workspaceId, importId)}manifest.v1.json.gz`;
}

export function mailboxArchiveChunkKey(ownerId: string, workspaceId: string, importId: string, index: number): string {
  return `${mailboxArchivePrefix(ownerId, workspaceId, importId)}chunks/${index}.json.gz`;
}

export function assertMailboxArchivePointer(key: string, ownerId: string, workspaceId: string, importId: string): void {
  if (!key.startsWith(mailboxArchivePrefix(ownerId, workspaceId, importId))) {
    throw new Error('Mailbox archive pointer is outside the authenticated import scope.');
  }
}

export function assertMailboxChunks(
  chunks: MailboxArchiveChunk[], ownerId: string, workspaceId: string, importId: string, expectedCount: number,
): void {
  if (expectedCount === 0 && chunks.length === 0) return;
  if (!chunks.length || chunks.length > 250) throw new Error('Mailbox archive chunk count is invalid.');
  let count = 0;
  chunks.forEach((chunk, index) => {
    const expected = mailboxArchiveChunkKey(ownerId, workspaceId, importId, index);
    if (chunk.key !== expected) throw new Error('Mailbox archive chunk is outside the authenticated import scope.');
    if (!/^[a-f0-9]{64}$/.test(chunk.checksum) || chunk.count < 0 || chunk.count > 100) throw new Error('Mailbox archive chunk metadata is invalid.');
    count += chunk.count;
  });
  if (count !== expectedCount) throw new Error('Mailbox archive message count mismatch.');
}
