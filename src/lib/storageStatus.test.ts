import { describe, expect, it } from 'vitest';
import { capacityStatus, formatBytes } from './storageStatus';

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

  it('changes warning tone at 75 and critical tone at 90 percent', () => {
    expect(capacityStatus(749, 1_000).tone).toBe('safe');
    expect(capacityStatus(750, 1_000).tone).toBe('warning');
    expect(capacityStatus(899, 1_000).tone).toBe('warning');
    expect(capacityStatus(900, 1_000).tone).toBe('critical');
  });

  it('formats decimal provider quotas without implying binary units', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(125_000_000)).toBe('125 MB');
    expect(formatBytes(10_000_000_000)).toBe('10 GB');
  });
});
