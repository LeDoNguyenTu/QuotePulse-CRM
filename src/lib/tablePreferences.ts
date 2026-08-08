export type ConfigurableTable = 'companies' | 'deals' | 'contacts';
export type TableColumnPreferences = Partial<Record<ConfigurableTable, string[]>>;

/** Existing UI columns are intentionally the first-login defaults. */
export const DEFAULT_VISIBLE_COLUMNS: Record<ConfigurableTable, string[]> = {
  companies: [
    'name_clean', 'products', 'industry', 'last_deal_at', 'source_priority',
    'primary_contact', 'flags', 'last_email',
  ],
  deals: [
    'product', 'deal_name_raw', 'deal_stage', 'amount', 'hubspot_created_at',
    'hubspot_modified_at', 'is_archived',
  ],
  contacts: ['full_name', 'email', 'phone', 'role_title', 'is_primary_contact', 'source'],
};

export function resolveVisibleColumns(
  table: ConfigurableTable,
  preferences: TableColumnPreferences | null | undefined
) {
  return preferences?.[table] ?? DEFAULT_VISIBLE_COLUMNS[table];
}

export function saveVisibleColumns(
  preferences: TableColumnPreferences | null | undefined,
  table: ConfigurableTable,
  columns: string[] | null
): TableColumnPreferences {
  const next = { ...(preferences ?? {}) };
  if (columns === null) delete next[table];
  else next[table] = [...new Set(columns)];
  return next;
}
