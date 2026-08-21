import { describe, expect, it } from 'vitest';
import { archiveAutomationSummary, capacityStatus, formatBytes } from './storageStatus';

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

  it('matches the automatic archive thresholds at 70 and 85 percent', () => {
    expect(capacityStatus(699, 1_000).tone).toBe('safe');
    expect(capacityStatus(700, 1_000).tone).toBe('warning');
    expect(capacityStatus(849, 1_000).tone).toBe('warning');
    expect(capacityStatus(850, 1_000).tone).toBe('critical');
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
});
