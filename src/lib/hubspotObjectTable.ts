import type { HubspotPropertyCatalogEntry } from './types';

export type HubspotObjectTableType = 'deals' | 'contacts';

export interface HubspotObjectColumn {
  id: string;
  label: string;
  group?: 'available' | 'hidden';
}

export const HUBSPOT_OBJECT_BASE_COLUMNS: Record<HubspotObjectTableType, HubspotObjectColumn[]> = {
  deals: [
    { id: 'hubspot_deal_id', label: 'HubSpot deal ID' },
    { id: 'product', label: 'Product' },
    { id: 'deal_name_raw', label: 'Deal name' },
    { id: 'deal_stage', label: 'Deal stage' },
    { id: 'pipeline', label: 'Pipeline' },
    { id: 'amount', label: 'Amount' },
    { id: 'hubspot_created_at', label: 'HubSpot created' },
    { id: 'hubspot_modified_at', label: 'HubSpot last modified' },
    { id: 'is_archived', label: 'Archived' },
  ],
  contacts: [
    { id: 'full_name', label: 'Full name' },
    { id: 'email', label: 'Email' },
    { id: 'phone', label: 'Phone' },
    { id: 'role_title', label: 'Role title' },
    { id: 'is_primary_contact', label: 'Primary contact' },
    { id: 'source', label: 'Source' },
    { id: 'created_at', label: 'Imported at' },
    { id: 'updated_at', label: 'Last database update' },
  ],
};

interface ObjectRow {
  hubspot_properties?: Record<string, string | null> | null;
}

/** Normalized fields win when a HubSpot property happens to use the same name. */
export function hubspotObjectCellValue(row: ObjectRow, columnId: string): unknown {
  const normalized = row as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(row, columnId)) return normalized[columnId] ?? null;
  return row.hubspot_properties?.[columnId] ?? null;
}

export function mergeHubspotColumnOptions(
  objectType: HubspotObjectTableType,
  catalog: Array<Pick<HubspotPropertyCatalogEntry, 'property_name' | 'label' | 'has_value'>>
): HubspotObjectColumn[] {
  const base = HUBSPOT_OBJECT_BASE_COLUMNS[objectType];
  const seen = new Set(base.map((column) => column.id));
  const propertyColumns = catalog
    .filter((field) => !seen.has(field.property_name))
    .map((field) => ({
      id: field.property_name,
      label: field.label,
      group: field.has_value ? 'available' as const : 'hidden' as const,
    }));
  return [...base, ...propertyColumns];
}
