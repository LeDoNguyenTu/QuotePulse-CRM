import { describe, expect, it } from 'vitest';
import {
  importActivityText,
  liveImportPercent,
  importResponseTimestamp,
  recentDealsPerSecond,
  recentImportEtaMinutes,
} from './importProgress';

describe('HubSpot import progress timing', () => {
  it('calculates throughput from only the latest completed server step', () => {
    expect(recentDealsPerSecond(100, 160, 1_000, 31_000)).toBe(2);
  });

  it('hides throughput when the latest step did not import another deal', () => {
    expect(recentDealsPerSecond(160, 160, 1_000, 31_000)).toBeNull();
    expect(recentDealsPerSecond(160, 159, 1_000, 31_000)).toBeNull();
  });

  it('shows ETA only for measurable normal deal progress', () => {
    expect(recentImportEtaMinutes(600, 2, 'backfill')).toBe(5);
    expect(recentImportEtaMinutes(600, null, 'backfill')).toBeNull();
    expect(recentImportEtaMinutes(600, 2, 'properties')).toBeNull();
  });

  it('shows core sync as complete while historical property maintenance continues', () => {
    expect(liveImportPercent(1_000, 999, 'backfill')).toBe(99);
    expect(liveImportPercent(1_000, 1_000, 'backfill')).toBe(99);
    expect(liveImportPercent(1_000, 1_000, 'properties')).toBe(100);
    expect(liveImportPercent(null, 0, 'backfill')).toBeNull();
  });

  it('changes the activity message at the slow-step boundary', () => {
    expect(importActivityText(12)).toBe('Working - last server response 12s ago');
    expect(importActivityText(59)).toBe('Working - last server response 59s ago');
    expect(importActivityText(60)).toBe(
      'This step is taking longer than usual - still waiting for the server'
    );
  });

  it('uses the active run start for legacy saved state without a step timestamp', () => {
    expect(importResponseTimestamp(undefined, 5_000)).toBe(5_000);
    expect(importResponseTimestamp(8_000, 5_000)).toBe(8_000);
  });
});
