import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { Layout } from './Layout';

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ user: { email: 'owner@example.com' }, signOut: vi.fn() }),
}));

vi.mock('../hooks/useWorkspaces', () => ({
  useOptionalActiveWorkspace: () => ({ id: 'sales-id', name: 'Sales CRM', kind: 'sales_crm', role: 'owner' }),
}));

vi.mock('./crm/CrmReminderCenter', () => ({ CrmReminderCenter: () => <button>0 reminders</button> }));

function renderLayout(path: string) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <Layout area="sales"><p>Page content</p></Layout>
    </MemoryRouter>,
  );
}

describe('Layout navigation', () => {
  it('keeps core CRM records direct and groups outreach and utility tools', () => {
    const html = renderLayout('/w/sales-id/sales/companies');

    expect(html).toContain('href="/w/sales-id/sales/companies"');
    expect(html).toContain('href="/w/sales-id/sales/contacts"');
    expect(html).toContain('href="/w/sales-id/sales/deals"');
    expect(html).toContain('href="/w/sales-id/sales/tasks"');
    expect(html).toContain('aria-label="Outreach navigation"');
    expect(html).toContain('aria-label="Tools navigation"');
    expect(html).toContain('href="/w/sales-id/sales/email-campaigns"');
    expect(html).toContain('href="/w/sales-id/sales/settings"');
  });

  it('marks the group containing the current route without pinning its menu open', () => {
    const html = renderLayout('/w/sales-id/sales/email-campaigns');

    expect(html).toMatch(/<details[^>]*aria-label="Outreach navigation"[^>]*data-active="true"/);
    expect(html).not.toMatch(/<details[^>]*open=""/);
  });
});
