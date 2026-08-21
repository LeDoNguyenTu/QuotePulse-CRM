import { describe, expect, it, vi } from 'vitest';
import { resolveArchiveOwner } from './archiveAuth.ts';

describe('resolveArchiveOwner', () => {
  it('allows the server-only migration secret only with an explicit owner', async () => {
    const getUserId = vi.fn();
    const request = new Request('https://example.test', {
      headers: { 'x-archive-secret': 'server-secret' },
    });

    await expect(resolveArchiveOwner(request, 'owner-a', 'server-secret', getUserId))
      .resolves.toBe('owner-a');
    expect(getUserId).not.toHaveBeenCalled();
  });

  it('rejects a migration secret request without an owner id', async () => {
    const request = new Request('https://example.test', {
      headers: { 'x-archive-secret': 'server-secret' },
    });

    await expect(resolveArchiveOwner(request, undefined, 'server-secret', vi.fn()))
      .rejects.toThrow(/owner_id/i);
  });

  it('falls back to normal user authentication when the secret is absent or wrong', async () => {
    const getUserId = vi.fn().mockResolvedValue('signed-in-user');
    const request = new Request('https://example.test', {
      headers: { 'x-archive-secret': 'wrong-secret' },
    });

    await expect(resolveArchiveOwner(request, 'other-owner', 'server-secret', getUserId))
      .resolves.toBe('signed-in-user');
  });
});
