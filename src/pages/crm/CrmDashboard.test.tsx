import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { CrmDashboard } from './CrmDashboard';

vi.mock('../../hooks/useWorkspaces', () => ({
  useActiveWorkspace: () => ({ id: 'sales-id', name: 'Sales CRM' }),
}));

vi.mock('../../hooks/useStorageStatus', () => ({
  useStorageStatus: () => ({
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
    data: {
      measuredAt: '2026-10-07T00:00:00.000Z',
      database: { usedBytes: 250, limitBytes: 500 },
      r2: { usedBytes: 100, limitBytes: 1000, objectCount: 4, source: 'r2-inventory', cached: false },
      snapshots: null,
      compaction: null,
      archiveAutomation: {
        status: 'failed', pressure: 'warning', databaseBytes: 374_000_000,
        ownersProcessed: 0, dealsArchived: 0, genericAttachmentsArchived: 0,
        error: 'historic timeout', finishedAt: '2026-09-14T13:40:06.602Z',
      },
    },
  }),
}));

describe('Sales CRM dashboard', () => {
  it('shows database and archive capacity percentages beside the CRM modules', () => {
    const html = renderToStaticMarkup(<MemoryRouter><CrmDashboard /></MemoryRouter>);

    expect(html).toContain('Storage capacity');
    expect(html).toContain('Supabase database');
    expect(html).toContain('50%');
    expect(html).toContain('Cloudflare R2');
    expect(html).toContain('10%');
    expect(html).toContain('Latest recorded archive work failed');
    expect(html).toContain('Last recorded work');
  });
});
