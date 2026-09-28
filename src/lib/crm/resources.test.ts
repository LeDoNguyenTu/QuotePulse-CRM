import { describe, expect, it } from 'vitest';
import { CRM_RESOURCES, crmListSpec } from './resources';

describe('CRM resource query contracts', () => {
  it('uses only the new CRM tables', () => {
    expect(CRM_RESOURCES.companies.table).toBe('crm_companies');
    expect(CRM_RESOURCES.contacts.table).toBe('crm_contacts');
    expect(CRM_RESOURCES.deals.table).toBe('crm_deals');
  });

  it('selects associations in the contact and deal list query', () => {
    expect(CRM_RESOURCES.contacts.select).toContain('company:crm_companies(id,name)');
    expect(CRM_RESOURCES.deals.select).toContain('company:crm_companies(id,name)');
  });

  it('creates deterministic workspace-scoped page specifications', () => {
    expect(crmListSpec('companies', 'workspace-a', { page: 2, search: ' Acme ' })).toEqual({
      table: 'crm_companies',
      select: '*',
      workspaceId: 'workspace-a',
      from: 25,
      to: 49,
      searchColumn: 'name',
      search: 'Acme',
      order: [
        { column: 'name', ascending: true },
        { column: 'id', ascending: true },
      ],
    });
  });

  it('adds an exact deal status filter without changing the search contract', () => {
    expect(crmListSpec('deals', 'workspace-a', {
      page: 1,
      search: 'Renewal',
      status: 'won',
    })).toMatchObject({
      table: 'crm_deals',
      workspaceId: 'workspace-a',
      searchColumn: 'name',
      search: 'Renewal',
      filters: [{ column: 'status', value: 'won' }],
    });
  });

  it('builds allow-listed company filters and descending name order', () => {
    expect(crmListSpec('companies', 'workspace-a', {
      page: 1,
      search: '',
      industry: ' Engineering ',
      sort: 'name_desc',
    })).toMatchObject({
      filters: [{ column: 'industry', value: 'Engineering' }],
      order: [
        { column: 'name', ascending: false },
        { column: 'id', ascending: true },
      ],
    });
  });

  it('filters contacts by company and sorts newest first', () => {
    expect(crmListSpec('contacts', 'workspace-a', {
      page: 1,
      search: '',
      companyId: 'company-1',
      sort: 'recent',
    })).toMatchObject({
      filters: [{ column: 'company_id', value: 'company-1' }],
      order: [
        { column: 'created_at', ascending: false },
        { column: 'id', ascending: true },
      ],
    });
  });

  it('combines deal company/status filters with an allow-listed value sort', () => {
    expect(crmListSpec('deals', 'workspace-a', {
      page: 1,
      search: '',
      status: 'open',
      companyId: 'company-1',
      sort: 'value_desc',
    })).toMatchObject({
      filters: [
        { column: 'status', value: 'open' },
        { column: 'company_id', value: 'company-1' },
      ],
      order: [
        { column: 'amount', ascending: false },
        { column: 'id', ascending: true },
      ],
    });
  });
});
