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
    ]));

    const html = renderToStaticMarkup(
      <CrmColumnPicker table="crm_contacts" options={CRM_COLUMN_OPTIONS.crm_contacts} />,
    );
    expect(html).toContain('Main columns');
    expect(html).toContain('Additional columns');
    expect(html).toContain('Source &amp; relationships');
    expect(html).toContain('Search columns');
  });
});
