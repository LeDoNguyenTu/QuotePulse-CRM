import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { SalesWorkspacePage } from './SalesWorkspacePage';
import * as salesSettings from './crm/CrmSalesSettings';

vi.mock('./crm/CrmCompanies', () => ({ CrmCompanies: () => <div /> }));
vi.mock('./crm/CrmContacts', () => ({ CrmContacts: () => <div /> }));
vi.mock('./crm/CrmDashboard', () => ({ CrmDashboard: () => <div /> }));
vi.mock('./crm/CrmDeals', () => ({ CrmDeals: () => <div /> }));
vi.mock('./crm/CrmImports', () => ({ CrmImports: () => <div /> }));
vi.mock('./crm/CrmRecordDetailPage', () => ({ CrmRecordDetailPage: () => <div /> }));
vi.mock('./crm/CrmTasks', () => ({ CrmTasks: () => <div /> }));
vi.mock('./crm/CrmEmailCampaigns', () => ({ CrmEmailCampaigns: () => <div /> }));
vi.mock('./crm/CrmPstExtractor', () => ({ CrmPstExtractor: () => <div /> }));
vi.mock('./crm/CrmRecycleBin', () => ({ CrmRecycleBin: () => <div /> }));

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
      email_provider: 'brevo',
      daily_send_limit: 50,
      session_timeout_minutes: 60,
      ms_refresh_token: 'saved-token',
      ms_account_email: 'sales@example.com',
      brevo_sender_email: null,
      brevo_sender_name: null,
      brevo_api_key: 'saved-key',
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
    expect(html).not.toContain('<main class="crm-settings-content"');
    expect(html).toContain('aria-live="polite"');
  });

  it('associates controls with labels and preserves secret-removal controls', () => {
    const html = renderSettings();

    expect(html).toContain('aria-labelledby="sales-email-provider-label"');
    expect(html).toContain('aria-label="Daily send limit"');
    expect(html).toContain('aria-label="Current password"');
    expect(html).toContain('Remove the saved Brevo API key');
    expect(html).not.toContain('Disconnecting removes the saved token');
  });

  it('rejects delivery limits outside the persisted guard rail', () => {
    const validate = (salesSettings as any).validateSalesSettingsDraft;
    expect(validate).toBeTypeOf('function');
    if (typeof validate !== 'function') return;

    expect(validate(0, 60)).toContain('between 1 and 10,000');
    expect(validate(10001, 60)).toContain('between 1 and 10,000');
    expect(validate(50, 60)).toBeNull();
  });

  it('requires confirmation before forgetting the Microsoft token', () => {
    const confirmDisconnect = (salesSettings as any).confirmMicrosoftDisconnect;
    expect(confirmDisconnect).toBeTypeOf('function');
    if (typeof confirmDisconnect !== 'function') return;
    let prompt = '';

    expect(confirmDisconnect((message: string) => { prompt = message; return false; })).toBe(false);
    expect(prompt).toContain('does not revoke Microsoft-side access');
  });

});
