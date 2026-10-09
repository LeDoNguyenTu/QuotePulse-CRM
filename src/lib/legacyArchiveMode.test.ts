import { describe, expect, it } from 'vitest';
import { resolveLegacyDataMode } from './legacyArchiveMode';

describe('resolveLegacyDataMode', () => {
  it('opens the verified R2 archive when the Supabase copy was deleted', () => {
    expect(resolveLegacyDataMode({
      current: 'live',
      userSelected: false,
      liveCount: 2,
      liveCountResolved: true,
      archiveStatus: 'deleted',
    })).toBe('archived');
  });

  it('opens the archive when the live database is empty', () => {
    expect(resolveLegacyDataMode({
      current: 'live',
      userSelected: false,
      liveCount: 0,
      liveCountResolved: true,
      archiveStatus: 'verified',
    })).toBe('archived');
  });

  it('preserves an explicit user source selection', () => {
    expect(resolveLegacyDataMode({
      current: 'live',
      userSelected: true,
      liveCount: 0,
      liveCountResolved: true,
      archiveStatus: 'deleted',
    })).toBe('live');
  });
});
