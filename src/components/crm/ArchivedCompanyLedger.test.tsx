import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { bundleState } = vi.hoisted(() => ({ bundleState: { current: {} as Record<string, unknown> } }));
vi.mock('../../hooks/useArchivedCompanyBundle', () => ({
  useArchivedCompanyBundle: () => bundleState.current,
}));

import { ArchivedCompanyLedger } from './ArchivedCompanyLedger';

const company = { id: 'company-1', name_clean: 'Northstar Pte Ltd', industry: 'Technology', _archive_cursor: 'company-cursor' };
const baseProps = {
  workspaceId: 'workspace-1',
  archiveId: 'archive-1',
  rows: [company],
  columnOptions: [{ id: 'name_clean', label: 'Company' }, { id: 'industry', label: 'Industry' }],
  visibleColumns: ['name_clean', 'industry'],
  archivedAt: '2026-10-01T00:00:00Z',
  progress: { objects_read: 1, total_objects: 10, total_rows: 100 },
  page: 0, hasPrevious: false, hasNext: true, loading: false,
  onPrevious: vi.fn(), onNext: vi.fn(), onRestore: vi.fn(),
};

function text(renderer: ReactTestRenderer) {
  return JSON.stringify(renderer.toJSON());
}

describe('ArchivedCompanyLedger', () => {
  beforeEach(() => {
    baseProps.onRestore.mockReset();
    bundleState.current = {
      data: {
        status: 'ready', read_only: true,
        progress: { objects_indexed: 12, total_objects: 12 },
        contacts: [{ id: 'contact-1', full_name: 'Avery Tan', role_title: 'Director', email: 'avery@example.com', phone: '6123 4567', _archive_cursor: 'contact-cursor' }],
        deals: [{ id: 'deal-1', product: 'ADOBE', deal_name_raw: 'ADOBE - NORTHSTAR', deal_stage: 'qualified', amount: 4200, _archive_cursor: 'deal-cursor' }],
      },
      isLoading: false, error: null,
    };
  });

  it('keeps contacts and deals attached to their company in one expandable sheet', () => {
    let renderer!: ReactTestRenderer;
    act(() => { renderer = create(<ArchivedCompanyLedger {...baseProps} />); });
    expect(text(renderer)).toContain('Northstar Pte Ltd');
    expect(text(renderer)).not.toContain('Avery Tan');

    const disclosure = renderer.root.findByProps({ 'aria-expanded': false });
    act(() => { disclosure.props.onClick({ stopPropagation: vi.fn() }); });

    expect(text(renderer)).toContain('Avery Tan');
    expect(text(renderer)).toContain('ADOBE - NORTHSTAR');
    expect(text(renderer)).toContain('Contacts');
    expect(text(renderer)).toContain('Deals');

    const restoreButtons = renderer.root.findAllByProps({ children: 'Restore to edit' });
    act(() => { restoreButtons[1].props.onClick({ stopPropagation: vi.fn() }); });
    expect(baseProps.onRestore).toHaveBeenCalledWith('contacts', expect.objectContaining({ id: 'contact-1' }));
    act(() => { restoreButtons[2].props.onClick({ stopPropagation: vi.fn() }); });
    expect(baseProps.onRestore).toHaveBeenCalledWith('deals', expect.objectContaining({ id: 'deal-1' }));
  });

  it('shows exact indexing progress before relationships are ready', () => {
    bundleState.current = { data: { status: 'building', progress: { objects_indexed: 40, total_objects: 100 } }, isLoading: false, error: null };
    let renderer!: ReactTestRenderer;
    act(() => { renderer = create(<ArchivedCompanyLedger {...baseProps} />); });
    act(() => { renderer.root.findByProps({ 'aria-expanded': false }).props.onClick({ stopPropagation: vi.fn() }); });
    expect(text(renderer)).toContain('Linking archived contacts and deals');
    expect(renderer.root.findAllByType('span').map((node) => node.children.join(''))).toContain('40 of 100 archive objects indexed');
  });

  it('shows separate empty states without disconnecting them from the company', () => {
    bundleState.current = { data: { status: 'ready', progress: { objects_indexed: 1, total_objects: 1 }, contacts: [], deals: [] }, isLoading: false, error: null };
    let renderer!: ReactTestRenderer;
    act(() => { renderer = create(<ArchivedCompanyLedger {...baseProps} />); });
    act(() => { renderer.root.findByProps({ 'aria-expanded': false }).props.onClick({ stopPropagation: vi.fn() }); });
    expect(text(renderer)).toContain('No archived contacts are linked to this company.');
    expect(text(renderer)).toContain('No archived deals are linked to this company.');
  });
});
