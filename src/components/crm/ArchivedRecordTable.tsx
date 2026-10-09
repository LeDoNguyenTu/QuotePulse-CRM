import { archiveCellValue, type ArchiveColumn } from '../../lib/archiveTable';
import { formatDate } from '../../lib/dates';
import type { ArchivedLegacyTable } from '../../lib/functions';

interface Props {
  table: ArchivedLegacyTable;
  rows: Array<Record<string, unknown> & { _archive_cursor: string }>;
  columnOptions: ArchiveColumn[];
  visibleColumns: string[];
  archivedAt: string | null;
  progress: { objects_read: number; total_objects: number; total_rows: number };
  page: number;
  hasPrevious: boolean;
  hasNext: boolean;
  loading?: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onEdit: (row: Record<string, unknown> & { _archive_cursor: string }) => void;
}

const DATE_COLUMNS = new Set([
  'last_deal_at', 'last_hubspot_created_at', 'last_hubspot_modified_at',
  'hubspot_created_at', 'hubspot_modified_at', 'archived_at', 'created_at', 'updated_at',
]);

function display(value: unknown, columnId: string) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return value.toLocaleString();
  if (DATE_COLUMNS.has(columnId) && typeof value === 'string') return formatDate(value);
  if (columnId === 'source_priority' && typeof value === 'string') return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

export function ArchivedRecordTable({ table, rows, columnOptions, visibleColumns, archivedAt, progress, page, hasPrevious, hasNext, loading, onPrevious, onNext, onEdit }: Props) {
  const columns = columnOptions.filter((column) => visibleColumns.includes(column.id));
  return <section className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
      <div className="flex flex-wrap items-center gap-2">
        <span className="crm-archive-badge">Read-only R2 archive</span>
        <span>{archivedAt ? `Archived ${new Date(archivedAt).toLocaleString()}` : 'Verified archive'}</span>
      </div>
      <span>{progress.total_rows.toLocaleString()} {table}</span>
    </div>
    <div className="card relative overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>{columns.map((column) => <th key={column.id} className="whitespace-nowrap px-3 py-2">{column.label}</th>)}<th className="px-3 py-2 text-right">Access</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => <tr key={String(row.id)} className="cursor-pointer border-b border-slate-100 hover:bg-slate-50" onClick={() => onEdit(row)}>
            {columns.map((column) => {
              const rendered = display(archiveCellValue(row, column.id), column.id);
              return <td key={column.id} className="max-w-72 truncate whitespace-nowrap px-3 py-2 text-slate-700" title={rendered === '—' ? '' : rendered}>{rendered}</td>;
            })}
            <td className="px-3 py-2 text-right" onClick={(event) => event.stopPropagation()}><button className="btn-secondary whitespace-nowrap" type="button" disabled={loading} onClick={() => onEdit(row)}>Restore to edit</button></td>
          </tr>)}
        </tbody>
      </table>
      {!rows.length && <div className="p-8 text-center text-sm text-slate-500">No archived {table} found.</div>}
      {loading && <div className="absolute inset-0 grid place-items-center bg-white/65" aria-live="polite"><span>Loading archived {table}…</span></div>}
    </div>
    <footer className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
      <span>{progress.objects_read.toLocaleString()} of {progress.total_objects.toLocaleString()} archive objects searched · page {page + 1}</span>
      <div className="flex gap-2"><button className="btn-secondary" type="button" disabled={!hasPrevious || loading} onClick={onPrevious}>Prev</button><button className="btn-secondary" type="button" disabled={!hasNext || loading} onClick={onNext}>{loading ? 'Loading…' : 'Next'}</button></div>
    </footer>
  </section>;
}
