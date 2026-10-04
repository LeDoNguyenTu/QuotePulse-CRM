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
    expect(crmListSpec('companies', 'workspace-a', { page: 2, search: ' Acme ' })).toMatchObject({
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
      rpc: 'crm_list_companies',
      rpcArgs: expect.objectContaining({
        p_workspace_id: 'workspace-a',
        p_search: 'Acme',
        p_offset: 25,
        p_limit: 25,
      }),
    });
  });

  it('passes an exact source import filter to the contained list RPC', () => {
    expect(crmListSpec('contacts', 'workspace-a', {
      page: 1,
      search: '',
      sourceImportId: 'source-1',
    }).rpcArgs).toMatchObject({
      p_workspace_id: 'workspace-a',
      p_source_import_id: 'source-1',
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

  it('passes the customer status filter separately from industry', () => {
    expect(crmListSpec('companies', 'workspace-a', {
      page: 1,
      search: '',
      industry: 'Engineering',
      customerStatus: 'Maintenance Customer',
    }).rpcArgs).toMatchObject({
      p_workspace_id: 'workspace-a',
      p_industry: 'Engineering',
      p_customer_status: 'Maintenance Customer',
    });
  });

  it('passes contact lifecycle and visibility filters to the workspace-scoped RPC', () => {
    expect(crmListSpec('contacts', 'workspace-a', {
      page: 1,
      search: ' procurement ',
      contactState: 'outdated',
      contactVisibility: 'hidden',
      duplicateReview: 'required',
    }).rpcArgs).toMatchObject({
      p_workspace_id: 'workspace-a',
      p_search: 'procurement',
      p_record_state: 'outdated',
      p_visibility: 'hidden',
      p_duplicate_review: true,
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
        { column: 'amount', ascending: false, nullsFirst: false },
        { column: 'id', ascending: true },
      ],
    });
  });
});
