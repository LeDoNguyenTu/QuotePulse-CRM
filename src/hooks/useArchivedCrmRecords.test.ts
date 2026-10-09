import { describe, expect, it } from 'vitest';
import { archiveTablePlaceholder, archiveTableQueryKey } from './archiveTablePlaceholder';

describe('archiveTablePlaceholder', () => {
  const previous = { records: [{ id: 'company-1' }] };

  it('keeps previous results while paging or searching the same archive table', () => {
    expect(
      archiveTablePlaceholder(
        previous,
        archiveTableQueryKey('workspace-1', 'archive-1', 'companies', 'old search', 'old cursor'),
        archiveTableQueryKey('workspace-1', 'archive-1', 'companies', 'new search', undefined),
      ),
    ).toBe(previous);
  });

  it('clears previous results when switching archive tables', () => {
    expect(
      archiveTablePlaceholder(
        previous,
        archiveTableQueryKey('workspace-1', 'archive-1', 'companies', '', undefined),
        archiveTableQueryKey('workspace-1', 'archive-1', 'deals', '', undefined),
      ),
    ).toBeUndefined();
  });

  it('clears previous results when switching workspaces', () => {
    expect(
      archiveTablePlaceholder(
        previous,
        archiveTableQueryKey('workspace-1', 'archive-1', 'companies', '', undefined),
        archiveTableQueryKey('workspace-2', 'archive-1', 'companies', '', undefined),
      ),
    ).toBeUndefined();
  });

  it('clears previous results when switching archives', () => {
    expect(
      archiveTablePlaceholder(
        previous,
        archiveTableQueryKey('workspace-1', 'archive-1', 'companies', '', undefined),
        archiveTableQueryKey('workspace-1', 'archive-2', 'companies', '', undefined),
      ),
    ).toBeUndefined();
  });
});
