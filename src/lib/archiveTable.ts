import type { ArchivedLegacyTable } from './functions';

export interface ArchiveColumn {
  id: string;
  label: string;
  group?: 'available' | 'hidden';
}

type ArchiveCatalogEntry = { property_name: string; label: string; has_value: boolean };

export const ARCHIVE_BASE_COLUMNS: Record<ArchivedLegacyTable, ArchiveColumn[]> = {
  companies: [
    { id: 'name_clean', label: 'Company' },
    { id: 'name_raw', label: 'Original name' },
    { id: 'industry', label: 'Industry' },
    { id: 'website', label: 'Website' },
    { id: 'hubspot_company_id', label: 'HubSpot company ID' },
    { id: 'source_priority', label: 'Source' },
    { id: 'last_hubspot_created_at', label: 'HubSpot created' },
    { id: 'last_hubspot_modified_at', label: 'HubSpot last modified' },
    { id: 'last_deal_at', label: 'Last deal activity' },
    { id: 'created_at', label: 'Imported at' },
    { id: 'updated_at', label: 'Last database update' },
  ],
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
    { id: 'archived_at', label: 'Archived at' },
    { id: 'company_id', label: 'Company ID' },
    { id: 'created_at', label: 'Imported at' },
    { id: 'updated_at', label: 'Last database update' },
  ],
  contacts: [
    { id: 'full_name', label: 'Full name' },
    { id: 'email', label: 'Email' },
    { id: 'phone', label: 'Phone' },
    { id: 'role_title', label: 'Role title' },
    { id: 'is_primary_contact', label: 'Primary contact' },
    { id: 'source', label: 'Source' },
    { id: 'hubspot_contact_id', label: 'HubSpot contact ID' },
    { id: 'company_id', label: 'Company ID' },
    { id: 'created_at', label: 'Imported at' },
    { id: 'updated_at', label: 'Last database update' },
  ],
};

export function archiveColumnOptions(table: ArchivedLegacyTable, rows: Array<Record<string, unknown>>, selected: string[] = [], catalog: ArchiveCatalogEntry[] = []): ArchiveColumn[] {
  const base = ARCHIVE_BASE_COLUMNS[table];
  const known = new Set(base.map((column) => column.id));
  const properties = new Map<string, ArchiveColumn>();
  for (const field of catalog) {
    if (!known.has(field.property_name)) properties.set(field.property_name, {
      id: field.property_name,
      label: field.label,
      group: field.has_value ? 'available' : 'hidden',
    });
  }
  for (const row of rows) {
    const rowProperties = row.hubspot_properties;
    if (!rowProperties || typeof rowProperties !== 'object' || Array.isArray(rowProperties)) continue;
    Object.keys(rowProperties).forEach((id) => {
      if (!known.has(id) && !properties.has(id)) properties.set(id, { id, label: id.replace(/_/g, ' '), group: 'available' });
    });
  }
  selected.forEach((id) => {
    if (!known.has(id) && !properties.has(id)) properties.set(id, { id, label: id.replace(/_/g, ' '), group: 'available' });
  });
  return [...base, ...properties.values()];
}

export function archiveCellValue(row: Record<string, unknown>, columnId: string): unknown {
  if (Object.prototype.hasOwnProperty.call(row, columnId)) return row[columnId];
  const properties = row.hubspot_properties;
  return properties && typeof properties === 'object' && !Array.isArray(properties)
    ? (properties as Record<string, unknown>)[columnId]
    : null;
}
