import { describe, expect, it, vi } from 'vitest';
import { archivePolicy, createStorageMaintenanceHandler } from './handler.ts';

describe('storage pressure archive policy', () => {
  it('stays idle below seventy percent capacity', () => {
    expect(archivePolicy(349_999_999, 500_000_000, new Date('2026-08-22T12:00:00Z'))).toEqual({
      pressure: 'safe',
      shouldRun: false,
      batchLimit: 0,
    });
  });

  it('runs a normal batch every fifteen minutes from seventy percent', () => {
    expect(archivePolicy(350_000_000, 500_000_000, new Date('2026-08-22T12:15:00Z'))).toEqual({
      pressure: 'warning',
      shouldRun: true,
      batchLimit: 100,
    });
    expect(archivePolicy(400_000_000, 500_000_000, new Date('2026-08-22T12:10:00Z')).shouldRun).toBe(false);
    expect(archivePolicy(400_000_000, 500_000_000, new Date('2026-08-22T12:16:00Z')).shouldRun).toBe(true);
  });

  it('runs a larger critical batch on every five-minute cron tick', () => {
    expect(archivePolicy(425_000_000, 500_000_000, new Date('2026-08-22T12:10:00Z'))).toEqual({
      pressure: 'critical',
      shouldRun: true,
      batchLimit: 200,
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
    recordRun: vi.fn().mockResolvedValue(undefined),
    now: () => new Date('2026-08-22T12:15:00Z'),
    databaseLimitBytes: 500_000_000,
    ...overrides,
  };
}

describe('storage maintenance handler', () => {
  it('does not query owners or archive when capacity is safe', async () => {
    const deps = dependencies({ databaseBytes: vi.fn().mockResolvedValue(300_000_000) });
    const response = await createStorageMaintenanceHandler(deps)(
      new Request('https://example.test/storage-maintenance', { method: 'POST' }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, status: 'idle', pressure: 'safe' });
    expect(deps.listOwners).not.toHaveBeenCalled();
    expect(deps.archiveOwner).not.toHaveBeenCalled();
  });

  it('archives every pending owner and records aggregate results', async () => {
    const deps = dependencies();
    const response = await createStorageMaintenanceHandler(deps)(
      new Request('https://example.test/storage-maintenance', { method: 'POST' }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      status: 'succeeded',
      pressure: 'warning',
      ownersProcessed: 2,
      dealsArchived: 6,
      genericAttachmentsArchived: 4,
    });
    expect(deps.recordRun).toHaveBeenCalledWith(expect.objectContaining({
      status: 'succeeded',
      pressure: 'warning',
      ownersProcessed: 2,
      dealsArchived: 6,
      genericAttachmentsArchived: 4,
    }));
    expect(deps.releaseLease).toHaveBeenCalledWith('lease-token');
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

  it('rejects callers without the cron secret', async () => {
    const response = await createStorageMaintenanceHandler(dependencies({
      authorize: vi.fn().mockRejectedValue(new Error('Unauthorized')),
    }))(new Request('https://example.test/storage-maintenance', { method: 'POST' }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: 'Unauthorized' });
  });
});
