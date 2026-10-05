export type CrmExportEntity = 'companies' | 'contacts' | 'deals';
export type CrmExportFormat = 'xlsx' | 'csv';
export type CrmExportFilters = Record<string, string | undefined>;

export interface CrmExportRequest {
  workspace_id: string;
  entity: CrmExportEntity;
  format: CrmExportFormat;
  columns: string[];
  scope:
    | { mode: 'selected'; ids: string[] }
    | { mode: 'all_matching'; filters: CrmExportFilters };
}

export function toggleSelectedRow(current: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(current);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function selectPageRows(current: ReadonlySet<string>, pageIds: string[]): Set<string> {
  const next = new Set(current);
  const allSelected = pageIds.length > 0 && pageIds.every((id) => next.has(id));
  pageIds.forEach((id) => allSelected ? next.delete(id) : next.add(id));
  return next;
}

export function buildCrmExportRequest(input: {
  workspaceId: string;
  entity: CrmExportEntity;
  format: CrmExportFormat;
  columns: string[];
  selectedIds: ReadonlySet<string>;
  filters: CrmExportFilters;
  exportSelected?: boolean;
}): CrmExportRequest {
  const useSelected = input.selectedIds.size > 0 && input.exportSelected !== false;
  return {
    workspace_id: input.workspaceId,
    entity: input.entity,
    format: input.format,
    columns: [...input.columns],
    scope: useSelected
      ? { mode: 'selected', ids: [...input.selectedIds] }
      : {
        mode: 'all_matching',
        filters: Object.fromEntries(Object.entries(input.filters).filter(([, value]) => value)),
      },
  };
}
