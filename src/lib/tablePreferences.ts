export type ConfigurableTable = 'companies' | 'deals' | 'contacts';
export type CrmConfigurableTable = 'crm_companies' | 'crm_deals' | 'crm_contacts';
export type TablePreferenceKey = ConfigurableTable | CrmConfigurableTable;
export type TableColumnPreferences = Partial<Record<TablePreferenceKey, string[]>>;

/** Existing UI columns are intentionally the first-login defaults. */
export const DEFAULT_VISIBLE_COLUMNS: Record<TablePreferenceKey, string[]> = {
  companies: [
    'name_clean', 'products', 'industry', 'hubspot_created_at', 'hubspot_last_modified_at', 'source_priority',
    'primary_contact', 'flags', 'last_email',
  ],
  deals: [
    'product', 'deal_name_raw', 'deal_stage', 'amount', 'hubspot_created_at',
    'hubspot_modified_at', 'is_archived',
  ],
  contacts: ['full_name', 'email', 'phone', 'role_title', 'is_primary_contact', 'source'],
  crm_companies: ['name', 'industry', 'location', 'phone', 'website'],
  crm_contacts: ['full_name', 'company', 'job_title', 'email', 'phone'],
  crm_deals: ['name', 'company', 'stage', 'status', 'amount', 'follow_up_at'],
};

export function resolveVisibleColumns(
  table: TablePreferenceKey,
  preferences: TableColumnPreferences | null | undefined
) {
  return preferences?.[table] ?? DEFAULT_VISIBLE_COLUMNS[table];
}

export function saveVisibleColumns(
  preferences: TableColumnPreferences | null | undefined,
  table: TablePreferenceKey,
  columns: string[] | null
): TableColumnPreferences {
  const next = { ...(preferences ?? {}) };
  if (columns === null) delete next[table];
  else next[table] = [...new Set(columns)];
  return next;
}
