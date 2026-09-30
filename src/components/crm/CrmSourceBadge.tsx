import type { CrmSourceSummary } from '../../lib/crm/types';
import type { CrmSourceFilter } from '../../lib/crm/sourceFilters';

export function sourceFilterFromSummary(source: CrmSourceSummary): CrmSourceFilter {
  return {
    id: source.id,
    databaseId: source.database_id,
    filename: source.filename,
    type: source.source_type,
    headers: source.headers,
    rowIndexAvailable: source.row_index_available,
  };
}

export function CrmSourceBadge({
  source,
  count = 1,
  onSelect,
}: {
  source: CrmSourceSummary | null | undefined;
  count?: number;
  onSelect: (source: CrmSourceFilter) => void;
}) {
  if (!source) return <span className="text-slate-400">—</span>;
  return <button
    type="button"
    className="inline-flex max-w-48 items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-left text-xs font-semibold text-blue-800 hover:bg-blue-100"
    title={`Filter by source ${source.filename}`}
    onClick={() => onSelect(sourceFilterFromSummary(source))}
  >
    <span className="truncate">{source.filename}</span>
    {count > 1 && <span aria-label={`${count} sources`}>+{count - 1}</span>}
  </button>;
}
