import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { LegacyWorkspaceArchivePanel } from './LegacyWorkspaceArchivePanel';

vi.mock('../hooks/useWorkspaces', () => ({
  useActiveWorkspace: () => ({ id: 'legacy-id' }),
}));

vi.mock('../hooks/useWorkspaceArchive', () => ({
  useWorkspaceArchive: () => ({
    latest: { data: {
      id: 'archive-id', status: 'building', restore_status: 'not_started', table_counts: {},
      manifest_key: null, created_at: '2026-09-29T16:23:33.854Z', verified_at: null, last_error: null,
    } },
    progress: { data: [
      { table_name: 'companies', restore_order: 10, status: 'archiving', object_count: 18, row_count: 4500 },
      { table_name: 'deals', restore_order: 30, status: 'pending', object_count: 0, row_count: 0 },
    ], error: null },
    archive: { isPending: false, error: null, mutate: vi.fn() },
    archiveAll: { isPending: false, error: null, mutate: vi.fn() },
    stopArchiveAll: vi.fn(),
    restore: { isPending: false, error: null, mutate: vi.fn() },
    dryRunDelete: { isPending: false, error: null, mutate: vi.fn() },
  }),
}));

describe('LegacyWorkspaceArchivePanel', () => {
  it('shows verified in-progress objects instead of zero final-manifest rows', () => {
    const html = renderToStaticMarkup(<LegacyWorkspaceArchivePanel />);

    expect(html).toContain('4,500');
    expect(html).toContain('18 verified objects');
    expect(html).toContain('Current table');
    expect(html).toContain('companies');
    expect(html).toContain('Archive all remaining data');
    expect(html).toContain('Resume one bounded step');
  });
});
