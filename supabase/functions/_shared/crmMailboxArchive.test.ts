import { describe, expect, it } from 'vitest';
import { assertMailboxArchivePointer, mailboxArchiveKey } from './crmMailboxArchive';

describe('CRM mailbox archive containment', () => {
  it('builds and accepts only the exact owner/workspace/import pointer', () => {
    const key = mailboxArchiveKey('owner-a', 'workspace-a', 'import-a');
    expect(() => assertMailboxArchivePointer(key, 'owner-a', 'workspace-a', 'import-a')).not.toThrow();
    expect(() => assertMailboxArchivePointer('owners/other/mail.json.gz', 'owner-a', 'workspace-a', 'import-a')).toThrow(/outside/i);
  });
});
