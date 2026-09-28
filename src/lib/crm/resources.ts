import { crmPageRange } from './pagination';

export type CrmResourceName = 'companies' | 'contacts' | 'deals';

interface ResourceDefinition {
  table: string;
  select: string;
  searchColumn: string;
  order: Array<{ column: string; ascending: boolean; nullsFirst?: boolean }>;
}

export const CRM_RESOURCES: Record<CrmResourceName, ResourceDefinition> = {
  companies: {
    table: 'crm_companies',
    select: '*',
    searchColumn: 'name',
    order: [
      { column: 'name', ascending: true },
      { column: 'id', ascending: true },
    ],
  },
  contacts: {
    table: 'crm_contacts',
    select: '*,company:crm_companies(id,name)',
    searchColumn: 'full_name',
    order: [
      { column: 'full_name', ascending: true },
      { column: 'id', ascending: true },
    ],
  },
  deals: {
    table: 'crm_deals',
    select: '*,company:crm_companies(id,name)',
    searchColumn: 'name',
    order: [
      { column: 'created_at', ascending: false },
      { column: 'id', ascending: true },
    ],
  },
};

export interface CrmListFilters {
  page: number;
  search: string;
  status?: string;
  companyId?: string;
  industry?: string;
  sort?: string;
}

const SORT_ORDERS: Record<CrmResourceName, Record<string, ResourceDefinition['order']>> = {
  companies: {
    name_asc: CRM_RESOURCES.companies.order,
    name_desc: [{ column: 'name', ascending: false }, { column: 'id', ascending: true }],
    recent: [{ column: 'created_at', ascending: false }, { column: 'id', ascending: true }],
  },
  contacts: {
    name_asc: CRM_RESOURCES.contacts.order,
    name_desc: [{ column: 'full_name', ascending: false }, { column: 'id', ascending: true }],
    recent: [{ column: 'created_at', ascending: false }, { column: 'id', ascending: true }],
  },
  deals: {
    recent: CRM_RESOURCES.deals.order,
    value_desc: [{ column: 'amount', ascending: false, nullsFirst: false }, { column: 'id', ascending: true }],
    follow_up: [{ column: 'follow_up_at', ascending: true }, { column: 'id', ascending: true }],
  },
};

export function crmListSpec(
  resource: CrmResourceName,
  workspaceId: string,
  filters: CrmListFilters,
) {
  const definition = CRM_RESOURCES[resource];
  const range = crmPageRange(filters.page);
  const status = filters.status?.trim();
  const companyId = filters.companyId?.trim();
  const industry = filters.industry?.trim();
  const exactFilters = [
    ...(resource === 'deals' && status ? [{ column: 'status', value: status }] : []),
    ...(resource !== 'companies' && companyId ? [{ column: 'company_id', value: companyId }] : []),
    ...(resource === 'companies' && industry ? [{ column: 'industry', value: industry }] : []),
  ];
  return {
    table: definition.table,
    select: definition.select,
    workspaceId,
    ...range,
    searchColumn: definition.searchColumn,
    search: filters.search.trim(),
    order: SORT_ORDERS[resource][filters.sort ?? ''] ?? definition.order,
    ...(exactFilters.length ? { filters: exactFilters } : {}),
  };
}
