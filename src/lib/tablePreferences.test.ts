import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VISIBLE_COLUMNS,
  resolveVisibleColumns,
  saveVisibleColumns,
  type TableColumnPreferences,
} from './tablePreferences';

describe('table preferences', () => {
  it('keeps the current columns visible when no user override exists', () => {
    expect(resolveVisibleColumns('companies', null)).toEqual(DEFAULT_VISIBLE_COLUMNS.companies);
  });

  it('persists only the columns deliberately chosen for a table', () => {
    const current: TableColumnPreferences = { deals: ['deal_name_raw', 'amount'] };
    expect(saveVisibleColumns(current, 'contacts', ['email', 'phone'])).toEqual({
      deals: ['deal_name_raw', 'amount'],
      contacts: ['email', 'phone'],
    });
  });

  it('restores the current default set when a saved selection is removed', () => {
    expect(resolveVisibleColumns('contacts', { contacts: ['email'] })).toEqual(['email']);
    expect(saveVisibleColumns({ contacts: ['email'] }, 'contacts', null)).toEqual({});
  });
});
