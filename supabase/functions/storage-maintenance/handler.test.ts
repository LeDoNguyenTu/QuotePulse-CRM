import { describe, expect, it, vi } from 'vitest';
import { archivePolicy, createStorageMaintenanceHandler } from './handler.ts';

describe('storage pressure archive policy', () => {
  it('stays idle below sixty percent capacity', () => {
    expect(archivePolicy(299_999_999, 500_000_000, new Date('2026-08-22T12:00:00Z'))).toEqual({
      pressure: 'safe',
      shouldRun: false,
      batchLimit: 0,
    });
  });

  it('runs a small global batch every five minutes from sixty percent', () => {
    expect(archivePolicy(300_000_000, 500_000_000, new Date('2026-08-22T12:15:00Z'))).toEqual({
      pressure: 'warning',
      shouldRun: true,
      batchLimit: 25,
    });
    expect(archivePolicy(374_999_999, 500_000_000, new Date('2026-08-22T12:16:00Z')).shouldRun).toBe(false);
  });

  it('runs a medium global batch every minute from seventy-five percent', () => {
    expect(archivePolicy(375_000_000, 500_000_000, new Date('2026-08-22T12:11:00Z'))).toEqual({
      pressure: 'high',
      shouldRun: true,
      batchLimit: 50,
    });
    expect(archivePolicy(409_999_999, 500_000_000, new Date('2026-08-22T12:12:00Z')).pressure).toBe('high');
  });

  it('runs a bounded critical batch every minute from eighty-two percent', () => {
    expect(archivePolicy(410_000_000, 500_000_000, new Date('2026-08-22T12:11:00Z'))).toEqual({
      pressure: 'critical',
      shouldRun: true,
      batchLimit: 100,
    });
  });
});

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    authorize: vi.fn().mockResolvedValue(undefined),
    databaseBytes: vi.fn().mockResolvedValue(360_000_000),
    listOwners: vi.fn().mockResolvedValue(['owner-a', 'owner-b']),
    claimLease: vi.fn().mockResolvedValue('lease-token'),
    releaseLease: vi.fn().mockResolvedValue(undefined),
    archiveOwner: vi.fn()
      .mockResolvedValueOnce({ deals_archived: 4, generic_attachments_archived: 3, warnings: [] })
      .mockResolvedValueOnce({ deals_archived: 2, generic_attachments_archived: 1, warnings: [] }),
    completeOwnerAttempt: vi.fn().mockResolvedValue(undefined),
    recordRun: vi.fn().mockResolvedValue(undefined),
    now: () => new Date('2026-08-22T12:15:00Z'),
    databaseLimitBytes: 500_000_000,
    ...overrides,
  };
}

describe('storage maintenance handler', () => {
  it('does not query owners or archive when capacity is safe', async () => {
    const deps = dependencies({ databaseBytes: vi.fn().mockResolvedValue(299_999_999) });
    const response = await createStorageMaintenanceHandler(deps)(
      new Request('https://example.test/storage-maintenance', { method: 'POST' }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, status: 'idle', pressure: 'safe' });
    expect(deps.listOwners).not.toHaveBeenCalled();
    expect(deps.archiveOwner).not.toHaveBeenCalled();
  });

  it('archives only one pending owner and records the globally bounded result', async () => {
    const deps = dependencies();
    const response = await createStorageMaintenanceHandler(deps)(
      new Request('https://example.test/storage-maintenance', { method: 'POST' }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      status: 'succeeded',
      pressure: 'warning',
      ownersProcessed: 1,
      dealsArchived: 4,
      genericAttachmentsArchived: 3,
    });
    expect(deps.archiveOwner).toHaveBeenCalledTimes(1);
    expect(deps.archiveOwner).toHaveBeenCalledWith('owner-a', 25);
    expect(deps.completeOwnerAttempt).toHaveBeenCalledWith('owner-a', true);
    expect(deps.recordRun).toHaveBeenCalledWith(expect.objectContaining({
      status: 'succeeded',
      pressure: 'warning',
      ownersProcessed: 1,
      dealsArchived: 4,
      genericAttachmentsArchived: 3,
    }));
    expect(deps.releaseLease).toHaveBeenCalledWith('lease-token');
  });

  it('coalesces a successful zero-owner tick without inserting history', async () => {
    const deps = dependencies({ listOwners: vi.fn().mockResolvedValue([]) });
    const response = await createStorageMaintenanceHandler(deps)(
      new Request('https://example.test/storage-maintenance', { method: 'POST' }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, status: 'succeeded', ownersProcessed: 0 });
    expect(deps.archiveOwner).not.toHaveBeenCalled();
    expect(deps.completeOwnerAttempt).not.toHaveBeenCalled();
    expect(deps.recordRun).not.toHaveBeenCalled();
  });

  it('advances the owner cursor but coalesces a successful zero-work attempt', async () => {
    const deps = dependencies({
      listOwners: vi.fn().mockResolvedValue(['owner-a']),
      archiveOwner: vi.fn().mockResolvedValue({
        deals_archived: 0,
        generic_attachments_archived: 0,
        warnings: [],
      }),
    });
    const response = await createStorageMaintenanceHandler(deps)(
      new Request('https://example.test/storage-maintenance', { method: 'POST' }),
    );
    expect(response.status).toBe(200);
    expect(deps.completeOwnerAttempt).toHaveBeenCalledWith('owner-a', false);
    expect(deps.recordRun).not.toHaveBeenCalled();
  });

  it('does not overlap a maintenance run that already holds the lease', async () => {
    const deps = dependencies({ claimLease: vi.fn().mockResolvedValue(null) });
    const response = await createStorageMaintenanceHandler(deps)(
      new Request('https://example.test/storage-maintenance', { method: 'POST' }),
    );
    expect(await response.json()).toMatchObject({ ok: true, status: 'idle', reason: 'already-running' });
    expect(deps.listOwners).not.toHaveBeenCalled();
    expect(deps.archiveOwner).not.toHaveBeenCalled();
  });

  it('records archive warnings as a degraded run', async () => {
    const deps = dependencies({
      listOwners: vi.fn().mockResolvedValue(['owner-a']),
      archiveOwner: vi.fn().mockResolvedValue({
        deals_archived: 2,
        generic_attachments_archived: 0,
        warnings: ['attachment batch: R2 unavailable'],
      }),
    });
    const response = await createStorageMaintenanceHandler(deps)(
      new Request('https://example.test/storage-maintenance', { method: 'POST' }),
    );
    expect(await response.json()).toMatchObject({ ok: true, status: 'degraded' });
    expect(deps.recordRun).toHaveBeenCalledWith(expect.objectContaining({
      status: 'degraded',
      warnings: ['owner-a: attachment batch: R2 unavailable'],
    }));
  });

  it('formats structured service errors instead of returning object Object', async () => {
    const deps = dependencies({
      listOwners: vi.fn().mockResolvedValue(['owner-a']),
      archiveOwner: vi.fn().mockRejectedValue({
        message: 'R2 write rejected',
        details: 'bucket quota response',
        code: 'R2_WRITE',
      }),
    });
    const response = await createStorageMaintenanceHandler(deps)(
      new Request('https://example.test/storage-maintenance', { method: 'POST' }),
    );
    expect(response.status).toBe(500);
    expect((await response.json()).error).toContain('R2 write rejected');
    expect(deps.completeOwnerAttempt).not.toHaveBeenCalled();
    expect(deps.recordRun).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.stringContaining('R2 write rejected'),
    }));
  });

  it('rejects callers without the cron secret', async () => {
    const response = await createStorageMaintenanceHandler(dependencies({
      authorize: vi.fn().mockRejectedValue(new Error('Unauthorized')),
    }))(new Request('https://example.test/storage-maintenance', { method: 'POST' }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: 'Unauthorized' });
  });
});
