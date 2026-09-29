import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { SalesWorkspacePage } from './SalesWorkspacePage';

vi.mock('./crm/CrmCompanies', () => ({ CrmCompanies: () => <div /> }));
vi.mock('./crm/CrmContacts', () => ({ CrmContacts: () => <div /> }));
vi.mock('./crm/CrmDashboard', () => ({ CrmDashboard: () => <div /> }));
vi.mock('./crm/CrmDeals', () => ({ CrmDeals: () => <div /> }));
vi.mock('./crm/CrmImports', () => ({ CrmImports: () => <div /> }));
vi.mock('./crm/CrmRecordDetailPage', () => ({ CrmRecordDetailPage: () => <div /> }));
vi.mock('./crm/CrmTasks', () => ({ CrmTasks: () => <div /> }));
vi.mock('./crm/CrmEmailCampaigns', () => ({ CrmEmailCampaigns: () => <div /> }));
vi.mock('./crm/CrmPstExtractor', () => ({ CrmPstExtractor: () => <div /> }));

vi.mock('../hooks/useWorkspaces', () => ({
  useActiveWorkspace: () => ({ id: 'sales-id', name: 'Sales CRM', kind: 'sales_crm', role: 'owner' }),
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { email: 'owner@example.com' },
    changeLoginEmail: vi.fn(),
    changePassword: vi.fn(),
    applySessionTimeoutMinutes: vi.fn(),
  }),
}));

vi.mock('../hooks/useSettings', () => ({
  useSettings: () => ({
    data: {
      email_provider: 'microsoft_graph',
      daily_send_limit: 50,
      session_timeout_minutes: 60,
      ms_refresh_token: 'saved-token',
      ms_account_email: 'sales@example.com',
      brevo_sender_email: null,
      brevo_sender_name: null,
      brevo_api_key: null,
    },
    isLoading: false,
  }),
  useSaveSettings: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useDisconnectMicrosoft: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));

vi.mock('../lib/functions', () => ({
  functions: { msAuthStart: vi.fn() },
}));

function renderSettings() {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/w/sales-id/sales/settings']}>
      <Routes>
        <Route path="/w/:workspaceId/sales/:module" element={<SalesWorkspacePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Sales CRM settings', () => {
  it('renders organized delivery, security, and privacy controls instead of a placeholder', () => {
    const html = renderSettings();

    expect(html).toContain('Delivery defaults');
    expect(html).toContain('Account &amp; security');
    expect(html).toContain('Data &amp; privacy');
    expect(html).toContain('sales@example.com');
    expect(html).not.toContain('Workspace foundation active');
  });

  it('provides navigation landmarks and a save action', () => {
    const html = renderSettings();

    expect(html).toContain('Settings sections');
    expect(html).toContain('Save settings');
    expect(html).toContain('crm-settings-layout');
  });
});
