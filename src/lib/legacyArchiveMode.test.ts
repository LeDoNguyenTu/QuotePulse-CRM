import { describe, expect, it } from 'vitest';
import { resetArchivedTableView, resolveLegacyDataMode } from './legacyArchiveMode';

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

  it('stays live when the independent unfiltered count still has records', () => {
    expect(resolveLegacyDataMode({
      current: 'live',
      userSelected: false,
      liveCount: 12,
      liveCountResolved: true,
      archiveStatus: 'verified',
    })).toBe('live');
  });

  it('clears table-specific search and paging when archive tabs change', () => {
    expect(resetArchivedTableView('contacts')).toEqual({
      table: 'contacts',
      search: '',
      cursor: undefined,
      cursorHistory: [],
    });
  });
});
