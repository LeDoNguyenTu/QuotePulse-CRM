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
  it('keeps the Sales dashboard focused on CRM modules after storage moves to Operations', () => {
    const html = renderToStaticMarkup(<MemoryRouter><CrmDashboard /></MemoryRouter>);

    expect(html).not.toContain('Storage capacity');
    expect(html).toContain('Companies');
    expect(html).toContain('Contacts');
    expect(html).toContain('Deals');
  });
});
