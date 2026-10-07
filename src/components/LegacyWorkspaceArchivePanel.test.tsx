import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { LegacyWorkspaceArchivePanel } from './LegacyWorkspaceArchivePanel';

let archiveStatus = 'building';

vi.mock('../hooks/useWorkspaces', () => ({
  useActiveWorkspace: () => ({ id: 'legacy-id' }),
}));

vi.mock('../hooks/useWorkspaceArchive', () => ({
  useWorkspaceArchive: () => ({
    latest: { data: {
      id: 'archive-id', status: archiveStatus, restore_status: 'not_started', table_counts: archiveStatus === 'building' ? {} : { contacts: 226578, deals: 186735 },
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
    verifyAllForDeletion: { isPending: false, error: null, mutate: vi.fn() },
    deleteAll: { isPending: false, error: null, mutate: vi.fn() },
    stopDeletionWork: vi.fn(),
    deletionVerification: { data: { verified: 2, total: 2059 }, error: null },
  }),
}));

describe('LegacyWorkspaceArchivePanel', () => {
  it('shows verified in-progress objects instead of zero final-manifest rows', () => {
    archiveStatus = 'building';
    const html = renderToStaticMarkup(<LegacyWorkspaceArchivePanel />);

    expect(html).toContain('4,500');
    expect(html).toContain('18 verified objects');
    expect(html).toContain('Current table');
    expect(html).toContain('companies');
    expect(html).toContain('Archive all remaining data');
    expect(html).toContain('Resume one bounded step');
  });

  it('requires the verified row total before enabling bounded archive deletion', () => {
    archiveStatus = 'deletion_eligible';
    const html = renderToStaticMarkup(<LegacyWorkspaceArchivePanel />);

    expect(html).toContain('Delete archived legacy rows');
    expect(html).toContain('DELETE 413313');
    expect(html).toContain('2 / 2,059 archive objects deletion-verified');
    expect(html).toContain('Restore remains available from the verified R2 archive');
    expect(html).toContain('Referenced security or Sales CRM rows are retained');
  });
});
