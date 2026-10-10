import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CrmOperations } from './CrmOperations';

vi.mock('../../hooks/useWorkspaces', () => ({ useActiveWorkspace: () => ({ id: 'sales-id', name: 'Sales CRM' }) }));
vi.mock('../../hooks/crm/useCrmOperations', () => ({
  useCrmOperations: () => ({ isLoading: false, error: null, data: {
    checkedAt: '2026-10-11T00:00:00Z', delivery: { queued: 2, failed: 1, oldestQueuedAt: '2026-10-10T00:00:00Z' },
    brevo: { source: 'provider_reported', status: 'unhealthy', message: 'Brevo blocked this sending server IP.', credits: [{ type: 'email', credits: 42, creditsType: 'remaining' }], rateLimit: { limit: 100, remaining: 87, resetSeconds: 30 } },
    microsoft: { source: 'crm_tracked', used: 40, limit: 50, resetAt: null },
    serper: { source: 'crm_tracked', used: 95, limit: 100, resetAt: '2026-11-01T00:00:00Z' },
    nvidia: { source: 'crm_tracked', used: 0, limit: null, resetAt: null },
  }, refetch: vi.fn(), isFetching: false }),
  useSaveProviderBudget: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('../../components/StorageStatusPanel', () => ({ StorageStatusPanel: () => <section>Storage capacity</section> }));

describe('CrmOperations', () => {
  it('labels provider truth, warnings, delivery health, and storage in one module', () => {
    const html = renderToStaticMarkup(<CrmOperations />);
    expect(html).toContain('Operations');
    expect(html).toContain('Delivery health');
    expect(html).toContain('Provider reported');
    expect(html).toContain('CRM tracked');
    expect(html).toContain('95 of 100');
    expect(html).toContain('Storage capacity');
    expect(html).toContain('Brevo blocked this sending server IP');
    expect(html).toContain('42 remaining email credits');
    expect(html).toContain('87 of 100 API requests remaining');
  });
});
