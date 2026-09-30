import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CrmImports } from './CrmImports';
import { CrmPstExtractor } from './CrmPstExtractor';

vi.mock('../../hooks/useWorkspaces', () => ({
  useActiveWorkspace: () => ({ id: 'sales-id', name: 'Sales CRM', kind: 'sales_crm', role: 'owner' }),
}));

vi.mock('../../hooks/crm/useCrmImports', () => ({
  useCrmImports: () => ({
    indexes: { data: { companies: [], contacts: [] }, error: null },
    history: { data: [], isLoading: false },
    commit: { isPending: false, mutateAsync: vi.fn() },
  }),
}));

vi.mock('../../hooks/crm/usePstExtractor', () => ({
  usePstExtractor: () => ({
    state: { status: 'idle', preview: [], messageCount: 0, folders: 0, errors: 0 },
    extract: vi.fn(),
    save: { isPending: false, isSuccess: false, error: null, mutate: vi.fn() },
    saved: { data: [], error: null, isFetching: true },
  }),
}));

describe('CRM file upload controls', () => {
  it('presents workbook selection as a styled, descriptive action', () => {
    const html = renderToStaticMarkup(<CrmImports />);

    expect(html).toContain('crm-file-picker');
    expect(html).toContain('Select workbook');
    expect(html).toContain('Excel or CSV');
    expect(html).toContain('crm-file-picker-input');
  });

  it('presents PST selection as a styled local-only action', () => {
    const html = renderToStaticMarkup(<CrmPstExtractor />);

    expect(html).toContain('crm-file-picker');
    expect(html).toContain('Select PST file');
    expect(html).toContain('Stays on this device');
    expect(html).toContain('crm-file-picker-input');
  });

  it('shows a quiet update state without replacing saved mailbox results', () => {
    const html = renderToStaticMarkup(<CrmPstExtractor />);

    expect(html).toContain('Updating saved messages');
  });
});
