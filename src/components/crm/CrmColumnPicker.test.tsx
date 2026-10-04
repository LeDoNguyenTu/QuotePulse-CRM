import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CRM_COLUMN_OPTIONS } from '../../lib/crm/tableColumns';
import { CrmColumnPicker } from './CrmColumnPicker';

vi.mock('../../hooks/useWorkspaces', () => ({
  useActiveWorkspace: () => ({ id: 'workspace-1', name: 'Sales CRM', kind: 'sales_crm', role: 'owner' }),
}));

vi.mock('../../hooks/useSettings', () => ({
  useSettings: () => ({ data: { table_column_preferences: {} } }),
  useSaveSettings: () => ({ mutate: vi.fn() }),
}));

describe('CRM column picker', () => {
  it('offers all normalized contact columns in understandable groups', () => {
    const ids = CRM_COLUMN_OPTIONS.crm_contacts.map((item) => item.id);
    expect(ids).toEqual(expect.arrayContaining([
      'full_name',
      'company',
      'job_title',
      'email',
      'phone',
      'created_at',
      'updated_at',
      'source',
      'deal_count',
      'task_count',
      'record_state',
      'is_hidden',
      'duplicate_review',
    ]));

    const html = renderToStaticMarkup(
      <CrmColumnPicker table="crm_contacts" options={CRM_COLUMN_OPTIONS.crm_contacts} />,
    );
    expect(html).toContain('Main columns');
    expect(html).toContain('Additional columns');
    expect(html).toContain('Source &amp; relationships');
    expect(html).toContain('Search columns');
    expect(html).toContain('column-selector__panel');
  });

  it('offers call outcome and appointment status separately from deal stage', () => {
    const ids = CRM_COLUMN_OPTIONS.crm_deals.map((item) => item.id);
    expect(ids).toEqual(expect.arrayContaining(['stage', 'call_outcome', 'appointment_status']));
  });

  it('offers customer status and derived recent activity columns for companies', () => {
    const ids = CRM_COLUMN_OPTIONS.crm_companies.map((option) => option.id);
    expect(ids).toEqual(expect.arrayContaining([
      'customer_status', 'last_contact_at', 'follow_up_at', 'last_call_outcome', 'latest_activity',
    ]));
  });
});
