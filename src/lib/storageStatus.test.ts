import { describe, expect, it } from 'vitest';
import {
  archiveAutomationSummary,
  capacityStatus,
  formatBytes,
  formatRecoveryCountdown,
  importRecoveryLock,
  shouldStopImportForRecovery,
  storageStatusPollInterval,
  storageRecoverySummary,
} from './storageStatus';

const idleCompaction = {
  state: 'idle' as const,
  requestedAt: null,
  scheduledAt: null,
  startedAt: null,
  finishedAt: null,
  nextRetryAt: null,
  attemptCount: 0,
  databaseBytesBefore: null,
  databaseBytesAfter: null,
  dealToastBytesBefore: null,
  dealToastBytesAfter: null,
  lastError: null,
  skipReason: null,
};

describe('storage capacity status', () => {
  it('reports used, remaining, and a clamped progress width', () => {
    expect(capacityStatus(125_000_000, 500_000_000)).toEqual({
      usedBytes: 125_000_000,
      limitBytes: 500_000_000,
      remainingBytes: 375_000_000,
      percent: 25,
      progressPercent: 25,
      tone: 'safe',
    });
    expect(capacityStatus(600, 500)).toMatchObject({
      remainingBytes: 0,
      percent: 120,
      progressPercent: 100,
      tone: 'critical',
    });
  });

  it('matches the proactive archive and import-stop thresholds at 60 and 82 percent', () => {
    expect(capacityStatus(599, 1_000).tone).toBe('safe');
    expect(capacityStatus(600, 1_000).tone).toBe('warning');
    expect(capacityStatus(819, 1_000).tone).toBe('warning');
    expect(capacityStatus(820, 1_000).tone).toBe('critical');
  });

  it('formats decimal provider quotas without implying binary units', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(125_000_000)).toBe('125 MB');
    expect(formatBytes(10_000_000_000)).toBe('10 GB');
  });

  it('summarizes the latest automatic archive result', () => {
    expect(archiveAutomationSummary({
      status: 'succeeded',
      pressure: 'warning',
      databaseBytes: 360_000_000,
      ownersProcessed: 2,
      dealsArchived: 6,
      genericAttachmentsArchived: 4,
      error: null,
      finishedAt: '2026-08-22T12:15:00.000Z',
    })).toBe('Archived 6 deal snapshots and 4 attachment records across 2 accounts.');
    expect(archiveAutomationSummary({
      status: 'failed',
      pressure: 'critical',
      databaseBytes: 450_000_000,
      ownersProcessed: 0,
      dealsArchived: 0,
      genericAttachmentsArchived: 0,
      error: 'R2 unavailable',
      finishedAt: '2026-08-22T12:20:00.000Z',
    })).toBe('Automatic archive failed: R2 unavailable');
    expect(archiveAutomationSummary({
      status: 'degraded',
      pressure: 'warning',
      databaseBytes: 360_000_000,
      ownersProcessed: 1,
      dealsArchived: 2,
      genericAttachmentsArchived: 0,
      error: null,
      finishedAt: '2026-08-22T12:20:00.000Z',
    })).toBe('Automatic archive completed with warnings and will retry remaining data.');
  });

  it('distinguishes archive backlog, compaction required, and normal capacity', () => {
    expect(storageRecoverySummary(
      { totalDeals: 100, pendingSnapshots: 25, archivedSnapshots: 75 },
      { usedBytes: 736_000_000, limitBytes: 500_000_000 },
      idleCompaction,
    )).toMatchObject({ state: 'archiving', message: expect.stringContaining('25') });

    expect(storageRecoverySummary(
      { totalDeals: 100, pendingSnapshots: 0, archivedSnapshots: 100 },
      { usedBytes: 650_000_000, limitBytes: 500_000_000 },
      { ...idleCompaction, state: 'scheduled' },
    )).toMatchObject({ state: 'scheduled', message: expect.stringContaining('automatically') });

    expect(storageRecoverySummary(
      { totalDeals: 100, pendingSnapshots: 0, archivedSnapshots: 100 },
      { usedBytes: 400_000_000, limitBytes: 500_000_000 },
      { ...idleCompaction, state: 'succeeded' },
    )).toMatchObject({ state: 'normal', message: expect.stringContaining('below') });
  });

  it.each([
    ['cooldown', 'cooldown'],
    ['scheduled', 'scheduled'],
    ['running', 'running'],
    ['retry_wait', 'retry-wait'],
    ['failed_closed', 'failed-closed'],
  ] as const)('summarizes automatic compaction state %s', (state, expectedState) => {
    const summary = storageRecoverySummary(
      { totalDeals: 100, pendingSnapshots: 0, archivedSnapshots: 100 },
      { usedBytes: 450_000_000, limitBytes: 500_000_000 },
      { ...idleCompaction, state, nextRetryAt: '2026-08-27T03:00:00.000Z' },
    );
    expect(summary.state).toBe(expectedState);
    if (state !== 'failed_closed') expect(summary.message.toLowerCase()).not.toContain('manual compaction');
  });

  it('locks imports while snapshots are moving and calculates the archive countdown', () => {
    expect(importRecoveryLock({
      measuredAt: '2026-08-27T02:39:00.000Z',
      database: { usedBytes: 704_000_000, limitBytes: 500_000_000 },
      snapshots: { totalDeals: 186_735, pendingSnapshots: 55_000, archivedSnapshots: 59_888 },
      archiveAutomation: {
        status: 'succeeded',
        dealsArchived: 200,
        finishedAt: '2026-08-27T02:38:50.000Z',
      },
      compaction: idleCompaction,
    })).toMatchObject({
      locked: true,
      phase: 'archiving',
      pendingSnapshots: 55_000,
      estimatedArchiveCompleteAt: Date.parse('2026-08-27T07:14:00.000Z'),
    });
  });

  it('keeps imports locked for compaction and unlocks only below quota', () => {
    const recoveredSnapshots = { totalDeals: 186_735, pendingSnapshots: 0, archivedSnapshots: 186_735 };
    expect(importRecoveryLock({
      measuredAt: '2026-08-27T07:14:00.000Z',
      database: { usedBytes: 704_000_000, limitBytes: 500_000_000 },
      snapshots: recoveredSnapshots,
      archiveAutomation: null,
      compaction: { ...idleCompaction, state: 'scheduled' },
    })).toMatchObject({ locked: true, phase: 'compaction-required' });

    expect(importRecoveryLock({
      measuredAt: '2026-08-27T07:20:00.000Z',
      database: { usedBytes: 409_999_999, limitBytes: 500_000_000 },
      snapshots: recoveredSnapshots,
      archiveAutomation: null,
      compaction: { ...idleCompaction, state: 'succeeded' },
    })).toMatchObject({ locked: false, phase: 'ready' });

    expect(importRecoveryLock({
      measuredAt: '2026-08-27T07:20:00.000Z',
      database: { usedBytes: 410_000_000, limitBytes: 500_000_000 },
      snapshots: recoveredSnapshots,
      archiveAutomation: null,
      compaction: idleCompaction,
    })).toMatchObject({ locked: true, phase: 'compaction-required' });
  });

  it.each(['cooldown', 'scheduled', 'running', 'retry_wait', 'failed_closed'] as const)(
    'keeps imports locked during compaction state %s',
    (state) => {
      expect(importRecoveryLock({
        measuredAt: '2026-08-27T07:20:00.000Z',
        database: { usedBytes: 400_000_000, limitBytes: 500_000_000 },
        snapshots: { totalDeals: 100, pendingSnapshots: 0, archivedSnapshots: 100 },
        archiveAutomation: null,
        compaction: { ...idleCompaction, state },
      })).toMatchObject({ locked: true, phase: 'compaction-required' });
    },
  );

  it('fails closed while recovery status is loading or unavailable', () => {
    expect(importRecoveryLock(undefined, { loading: true })).toMatchObject({
      locked: true,
      phase: 'checking',
    });
    expect(importRecoveryLock({
      measuredAt: '2026-08-27T02:39:00.000Z',
      database: { usedBytes: 704_000_000, limitBytes: 500_000_000 },
      snapshots: { error: 'statement timeout' },
      archiveAutomation: null,
      compaction: idleCompaction,
    })).toMatchObject({ locked: true, phase: 'unavailable' });

    expect(importRecoveryLock({
      measuredAt: '2026-08-27T02:39:00.000Z',
      database: { usedBytes: 400_000_000, limitBytes: 500_000_000 },
      snapshots: { totalDeals: 100, pendingSnapshots: 0, archivedSnapshots: 100 },
      archiveAutomation: null,
      compaction: { error: 'controller unavailable' },
    })).toMatchObject({ locked: true, phase: 'unavailable' });

    expect(importRecoveryLock({
      measuredAt: '2026-08-27T02:39:00.000Z',
      database: { usedBytes: 400_000_000, limitBytes: 500_000_000 },
      snapshots: { totalDeals: 100, pendingSnapshots: 0, archivedSnapshots: 100 },
      archiveAutomation: null,
      compaction: { ...idleCompaction, state: 'unexpected' as never },
    })).toMatchObject({ locked: true, phase: 'unavailable' });
  });

  it('polls conservatively in safe capacity and every minute during pressure or recovery', () => {
    const safe = {
      measuredAt: '2026-08-27T02:39:00.000Z',
      database: { usedBytes: 300_000_000, limitBytes: 500_000_000 },
      snapshots: { totalDeals: 100, pendingSnapshots: 0, archivedSnapshots: 100 },
      archiveAutomation: null,
      compaction: idleCompaction,
    };
    expect(storageStatusPollInterval(safe)).toBe(5 * 60_000);
    expect(storageStatusPollInterval({ ...safe, database: { usedBytes: 375_000_000, limitBytes: 500_000_000 } }))
      .toBe(60_000);
    expect(storageStatusPollInterval({ ...safe, compaction: { ...idleCompaction, state: 'running' } }))
      .toBe(60_000);
    expect(storageStatusPollInterval(undefined)).toBe(60_000);
  });

  it('formats the recovery estimate as a ticking clock', () => {
    expect(formatRecoveryCountdown(4 * 60 * 60 * 1_000 + 35 * 60 * 1_000)).toBe('04:35:00');
    expect(formatRecoveryCountdown(45_001)).toBe('00:00:46');
    expect(formatRecoveryCountdown(-1)).toBe('00:00:00');
  });

  it('requests a running import to stop once recovery locks it', () => {
    const lock = importRecoveryLock(undefined, { loading: true });
    expect(shouldStopImportForRecovery(true, false, lock.locked)).toBe(true);
    expect(shouldStopImportForRecovery(false, false, lock.locked)).toBe(false);
    expect(shouldStopImportForRecovery(true, true, lock.locked)).toBe(false);
    expect(shouldStopImportForRecovery(true, false, false)).toBe(false);
  });
});
