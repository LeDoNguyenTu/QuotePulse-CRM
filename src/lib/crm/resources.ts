import { crmPageRange } from './pagination';

export type CrmResourceName = 'companies' | 'contacts' | 'deals';

interface ResourceDefinition {
  table: string;
  select: string;
  searchColumn: string;
  order: Array<{ column: string; ascending: boolean }>;
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
}

export function crmListSpec(
  resource: CrmResourceName,
  workspaceId: string,
  filters: CrmListFilters,
) {
  const definition = CRM_RESOURCES[resource];
  const range = crmPageRange(filters.page);
  const status = filters.status?.trim();
  return {
    table: definition.table,
    select: definition.select,
    workspaceId,
    ...range,
    searchColumn: definition.searchColumn,
    search: filters.search.trim(),
    order: definition.order,
    ...(resource === 'deals' && status
      ? { filters: [{ column: 'status', value: status }] }
      : {}),
  };
}
