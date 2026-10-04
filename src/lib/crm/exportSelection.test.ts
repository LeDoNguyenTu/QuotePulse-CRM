import { describe, expect, it } from 'vitest';
import {
  buildCrmExportRequest,
  selectPageRows,
  toggleSelectedRow,
} from './exportSelection';

describe('CRM export selection', () => {
  it('toggles one row without mutating the previous selection', () => {
    const current = new Set(['company-1']);
    const added = toggleSelectedRow(current, 'company-2');
    const removed = toggleSelectedRow(added, 'company-1');

    expect([...current]).toEqual(['company-1']);
    expect([...added]).toEqual(['company-1', 'company-2']);
    expect([...removed]).toEqual(['company-2']);
  });

  it('selects or clears only the current page', () => {
    const current = new Set(['outside-page']);
    const selected = selectPageRows(current, ['row-1', 'row-2']);
    const cleared = selectPageRows(selected, ['row-1', 'row-2']);

    expect([...selected]).toEqual(['outside-page', 'row-1', 'row-2']);
    expect([...cleared]).toEqual(['outside-page']);
  });

  it('preserves the requested column order for selected rows', () => {
    expect(buildCrmExportRequest({
      workspaceId: 'workspace-1',
      entity: 'contacts',
      format: 'xlsx',
      columns: ['phone', 'full_name', 'company'],
      selectedIds: new Set(['contact-2', 'contact-1']),
      filters: { search: 'director' },
    })).toEqual({
      workspace_id: 'workspace-1',
      entity: 'contacts',
      format: 'xlsx',
      columns: ['phone', 'full_name', 'company'],
      scope: { mode: 'selected', ids: ['contact-2', 'contact-1'] },
    });
  });

  it('uses server filters when no selected rows are requested', () => {
    expect(buildCrmExportRequest({
      workspaceId: 'workspace-1',
      entity: 'deals',
      format: 'csv',
      columns: ['name', 'stage'],
      selectedIds: new Set(),
      filters: { search: 'renewal', status: 'open' },
    })).toMatchObject({
      scope: {
        mode: 'all_matching',
        filters: { search: 'renewal', status: 'open' },
      },
    });
  });
});
