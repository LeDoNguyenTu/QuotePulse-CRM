export type ConfigurableTable = 'companies' | 'deals' | 'contacts';
export type CrmConfigurableTable = 'crm_companies' | 'crm_deals' | 'crm_contacts';
export type TablePreferenceKey = ConfigurableTable | CrmConfigurableTable;
type LegacyTableColumnPreferences = Partial<Record<TablePreferenceKey, string[]>>;

export interface VersionedTableColumnPreferences {
  version: 2;
  workspaces: Record<string, Partial<Record<CrmConfigurableTable, string[]>>>;
  sourceColumns?: Record<string, Record<string, Partial<Record<CrmConfigurableTable, string[]>>>>;
}

export type TableColumnPreferences = LegacyTableColumnPreferences | (
  VersionedTableColumnPreferences & LegacyTableColumnPreferences
);

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
  crm_companies: ['name', 'customer_status', 'industry', 'location', 'phone', 'latest_activity', 'source'],
  crm_contacts: ['full_name', 'company', 'job_title', 'email', 'phone', 'record_state', 'source'],
  crm_deals: ['name', 'company', 'stage', 'status', 'amount', 'follow_up_at', 'source'],
};

export function resolveVisibleColumns(
  table: TablePreferenceKey,
  preferences: TableColumnPreferences | null | undefined
) {
  return (preferences as LegacyTableColumnPreferences | null | undefined)?.[table]
    ?? DEFAULT_VISIBLE_COLUMNS[table];
}

function safeColumns(candidate: string[] | undefined, allowedIds: string[], fallback: string[]): string[] {
  const allowed = new Set(allowedIds);
  const sanitized = [...new Set(candidate ?? [])].filter((id) => allowed.has(id));
  if (sanitized.length > 0) return sanitized;
  return fallback.filter((id) => allowed.has(id));
}

function versionedPreferences(
  preferences: TableColumnPreferences | null | undefined,
): VersionedTableColumnPreferences | null {
  if (!preferences || !('version' in preferences) || preferences.version !== 2 || !preferences.workspaces) return null;
  return preferences as VersionedTableColumnPreferences;
}

export function resolveWorkspaceVisibleColumns(
  table: CrmConfigurableTable,
  workspaceId: string,
  preferences: TableColumnPreferences | null | undefined,
  allowedIds: string[],
  sourceId?: string | null,
): string[] {
  const versioned = versionedPreferences(preferences);
  const workspaceChoice = versioned?.workspaces[workspaceId]?.[table];
  const legacyChoice = (preferences as LegacyTableColumnPreferences | null | undefined)?.[table];
  const core = safeColumns(workspaceChoice ?? legacyChoice, allowedIds, DEFAULT_VISIBLE_COLUMNS[table]);
  const sourceChoice = sourceId ? versioned?.sourceColumns?.[workspaceId]?.[sourceId]?.[table] ?? [] : [];
  return [...new Set([...core, ...safeColumns(sourceChoice, allowedIds, [])])];
}

export function saveWorkspaceVisibleColumns(
  preferences: TableColumnPreferences | null | undefined,
  table: CrmConfigurableTable,
  workspaceId: string,
  columns: string[] | null,
  allowedIds: string[],
  sourceId?: string | null,
): TableColumnPreferences {
  const currentVersioned = versionedPreferences(preferences);
  const legacy = { ...(preferences ?? {}) } as LegacyTableColumnPreferences & Partial<VersionedTableColumnPreferences>;
  delete legacy[table];
  const workspace = { ...(currentVersioned?.workspaces[workspaceId] ?? {}) };
  const isSourceColumn = (id: string) => id.startsWith('source-column:');
  if (columns === null) delete workspace[table];
  else workspace[table] = safeColumns(columns.filter((id) => !isSourceColumn(id)), allowedIds, DEFAULT_VISIBLE_COLUMNS[table]);

  const sourceColumns = { ...(currentVersioned?.sourceColumns ?? {}) };
  if (sourceId) {
    const workspaceSources = { ...(sourceColumns[workspaceId] ?? {}) };
    const sourceTables = { ...(workspaceSources[sourceId] ?? {}) };
    if (columns === null) delete sourceTables[table];
    else sourceTables[table] = safeColumns(columns.filter(isSourceColumn), allowedIds, []);
    workspaceSources[sourceId] = sourceTables;
    sourceColumns[workspaceId] = workspaceSources;
  }

  return {
    ...legacy,
    version: 2,
    workspaces: {
      ...(currentVersioned?.workspaces ?? {}),
      [workspaceId]: workspace,
    },
    sourceColumns,
  } as TableColumnPreferences;
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
