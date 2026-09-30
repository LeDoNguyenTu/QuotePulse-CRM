import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VISIBLE_COLUMNS,
  resolveWorkspaceVisibleColumns,
  resolveVisibleColumns,
  saveWorkspaceVisibleColumns,
  saveVisibleColumns,
  type TableColumnPreferences,
} from './tablePreferences';

describe('table preferences', () => {
  it('keeps the current columns visible when no user override exists', () => {
    expect(resolveVisibleColumns('companies', null)).toEqual(DEFAULT_VISIBLE_COLUMNS.companies);
  });

  it('includes separate HubSpot created and last-modified timestamps by default', () => {
    expect(DEFAULT_VISIBLE_COLUMNS.companies).toEqual(
      expect.arrayContaining(['hubspot_created_at', 'hubspot_last_modified_at'])
    );
  });

  it('persists only the columns deliberately chosen for a table', () => {
    const current: TableColumnPreferences = { deals: ['deal_name_raw', 'amount'] };
    expect(saveVisibleColumns(current, 'contacts', ['email', 'phone'])).toEqual({
      deals: ['deal_name_raw', 'amount'],
      contacts: ['email', 'phone'],
    });
  });

  it('keeps independent saved selections for all three dashboard views', () => {
    const companies = saveVisibleColumns(null, 'companies', ['name_clean', 'industry']);
    const deals = saveVisibleColumns(companies, 'deals', ['deal_name_raw', 'custom_region']);
    const contacts = saveVisibleColumns(deals, 'contacts', ['full_name', 'email']);

    expect(resolveVisibleColumns('companies', contacts)).toEqual(['name_clean', 'industry']);
    expect(resolveVisibleColumns('deals', contacts)).toEqual(['deal_name_raw', 'custom_region']);
    expect(resolveVisibleColumns('contacts', contacts)).toEqual(['full_name', 'email']);
  });

  it('restores the current default set when a saved selection is removed', () => {
    expect(resolveVisibleColumns('contacts', { contacts: ['email'] })).toEqual(['email']);
    expect(saveVisibleColumns({ contacts: ['email'] }, 'contacts', null)).toEqual({});
  });

  it('persists independent Sales CRM list columns in the same account setting', () => {
    const companies = saveVisibleColumns(null, 'crm_companies', ['name', 'industry', 'website']);
    const contacts = saveVisibleColumns(companies, 'crm_contacts', ['full_name', 'company', 'email']);
    const deals = saveVisibleColumns(contacts, 'crm_deals', ['name', 'stage', 'amount', 'follow_up_at']);

    expect(resolveVisibleColumns('crm_companies', deals)).toEqual(['name', 'industry', 'website']);
    expect(resolveVisibleColumns('crm_contacts', deals)).toEqual(['full_name', 'company', 'email']);
    expect(resolveVisibleColumns('crm_deals', deals)).toEqual(['name', 'stage', 'amount', 'follow_up_at']);
  });

  it('reads legacy Sales CRM choices as a workspace fallback', () => {
    const legacy: TableColumnPreferences = { crm_contacts: ['full_name', 'email'] };

    expect(resolveWorkspaceVisibleColumns(
      'crm_contacts',
      'workspace-1',
      legacy,
      ['full_name', 'email'],
    )).toEqual(['full_name', 'email']);
  });

  it('sanitizes missing saved columns and restores safe defaults', () => {
    const preferences = {
      version: 2 as const,
      workspaces: { workspace_1: { crm_contacts: ['missing'] } },
    };

    expect(resolveWorkspaceVisibleColumns(
      'crm_contacts',
      'workspace_1',
      preferences,
      ['full_name'],
    )).toEqual(['full_name']);
  });

  it('saves CRM choices independently per workspace without losing legacy preferences', () => {
    const legacy: TableColumnPreferences = { companies: ['name_clean'], crm_contacts: ['email'] };
    const first = saveWorkspaceVisibleColumns(
      legacy,
      'crm_contacts',
      'workspace-1',
      ['full_name', 'email', 'email'],
      ['full_name', 'email'],
    );
    const second = saveWorkspaceVisibleColumns(
      first,
      'crm_contacts',
      'workspace-2',
      ['phone'],
      ['full_name', 'phone'],
    );

    expect(resolveVisibleColumns('companies', second)).toEqual(['name_clean']);
    expect(resolveWorkspaceVisibleColumns('crm_contacts', 'workspace-1', second, ['full_name', 'email'])).toEqual(['full_name', 'email']);
    expect(resolveWorkspaceVisibleColumns('crm_contacts', 'workspace-2', second, ['full_name', 'phone'])).toEqual(['phone']);
  });
});
