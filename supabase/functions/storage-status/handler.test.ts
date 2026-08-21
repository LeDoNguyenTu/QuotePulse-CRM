import { describe, expect, it, vi } from 'vitest';
import { createStorageStatusHandler } from './handler.ts';

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    authenticate: vi.fn().mockResolvedValue('user-id'),
    databaseBytes: vi.fn().mockResolvedValue(300_000_000),
    readCache: vi.fn().mockResolvedValue(null),
    writeCache: vi.fn().mockResolvedValue(undefined),
    r2Usage: vi.fn().mockResolvedValue({
      usedBytes: 2_000_000_000,
      objectCount: 450,
      measuredAt: '2026-08-21T12:00:00.000Z',
      source: 'r2-inventory',
    }),
    readArchiveAutomation: vi.fn().mockResolvedValue({
      status: 'succeeded',
      pressure: 'warning',
      databaseBytes: 360_000_000,
      ownersProcessed: 2,
      dealsArchived: 6,
      genericAttachmentsArchived: 4,
      error: null,
      finishedAt: '2026-08-21T12:04:00.000Z',
    }),
    now: () => new Date('2026-08-21T12:05:00.000Z'),
    databaseLimitBytes: 500_000_000,
    r2LimitBytes: 10_000_000_000,
    ...overrides,
  };
}

describe('storage status handler', () => {
  it('rejects methods other than GET and OPTIONS', async () => {
    const response = await createStorageStatusHandler(dependencies())(
      new Request('https://example.test/storage-status', { method: 'POST' })
    );
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET, OPTIONS');
  });

  it('returns 401 when the caller cannot be authenticated', async () => {
    const response = await createStorageStatusHandler(dependencies({
      authenticate: vi.fn().mockRejectedValue(new Error('Invalid or expired session')),
    }))(new Request('https://example.test/storage-status'));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: 'Invalid or expired session' });
  });

  it('uses a cache refreshed less than 15 minutes ago', async () => {
    const r2Usage = vi.fn();
    const response = await createStorageStatusHandler(dependencies({
      r2Usage,
      readCache: vi.fn().mockResolvedValue({
        usedBytes: 1_500,
        objectCount: 3,
        measuredAt: '2026-08-21T11:58:00.000Z',
        refreshedAt: '2026-08-21T11:58:00.000Z',
        source: 'r2-inventory',
      }),
    }))(new Request('https://example.test/storage-status'));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.r2).toMatchObject({ usedBytes: 1_500, objectCount: 3, cached: true });
    expect(r2Usage).not.toHaveBeenCalled();
  });

  it('returns one service when the other service fails', async () => {
    const response = await createStorageStatusHandler(dependencies({
      databaseBytes: vi.fn().mockRejectedValue(new Error('database unavailable')),
    }))(new Request('https://example.test/storage-status'));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.database).toEqual({ limitBytes: 500_000_000, error: 'database unavailable' });
    expect(payload.r2).toMatchObject({ usedBytes: 2_000_000_000, limitBytes: 10_000_000_000, cached: false });
  });

  it('includes the latest automatic archive run', async () => {
    const response = await createStorageStatusHandler(dependencies())(
      new Request('https://example.test/storage-status'),
    );
    expect(await response.json()).toMatchObject({
      archiveAutomation: {
        status: 'succeeded',
        pressure: 'warning',
        ownersProcessed: 2,
        dealsArchived: 6,
        genericAttachmentsArchived: 4,
      },
    });
  });
});
