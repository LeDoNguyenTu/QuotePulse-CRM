import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = readFileSync(fileURLToPath(new URL('./index.ts', import.meta.url)), 'utf8');

describe('crm-mailbox-archive contract', () => {
  it('authenticates, verifies membership, archives, and finalizes server-side', () => {
    expect(source).toContain('getUserId(req)');
    expect(source).toContain("from('workspace_members')");
    expect(source).toContain('putVerifiedArchive');
    expect(source).toContain("rpc('crm_finalize_mailbox_archive'");
  });
});
