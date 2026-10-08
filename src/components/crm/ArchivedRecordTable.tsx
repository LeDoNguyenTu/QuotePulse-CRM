import type { ArchivedLegacyTable } from '../../lib/functions';

const COLUMNS: Record<ArchivedLegacyTable, Array<{ key: string; label: string }>> = {
  companies: [{ key: 'name_clean', label: 'Company' }, { key: 'industry', label: 'Industry' }, { key: 'website', label: 'Website' }, { key: 'updated_at', label: 'Updated' }],
  deals: [{ key: 'deal_name_raw', label: 'Deal' }, { key: 'product', label: 'Product' }, { key: 'deal_stage', label: 'Stage' }, { key: 'amount', label: 'Amount' }],
  contacts: [{ key: 'full_name', label: 'Contact' }, { key: 'email', label: 'Email' }, { key: 'phone', label: 'Phone' }, { key: 'role_title', label: 'Role' }],
};

interface Props {
  table: ArchivedLegacyTable;
  rows: Array<Record<string, unknown> & { _archive_cursor: string }>;
  archivedAt: string | null;
  progress: { objects_read: number; total_objects: number; total_rows: number };
  hasNext: boolean;
  loading?: boolean;
  onNext: () => void;
  onEdit: (row: Record<string, unknown> & { _archive_cursor: string }) => void;
}

function display(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

export function ArchivedRecordTable({ table, rows, archivedAt, progress, hasNext, loading, onNext, onEdit }: Props) {
  const columns = COLUMNS[table];
  return <section className="crm-archive-browser">
    <header><div><span className="crm-archive-badge">Read-only R2 archive</span><h2>Archived {table}</h2><p>{archivedAt ? `Archived ${new Date(archivedAt).toLocaleString()}` : 'Verified archive'}</p></div><span>{progress.total_rows.toLocaleString()} total rows</span></header>
    <div className="overflow-x-auto"><table className="crm-table"><thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}<th>Actions</th></tr></thead><tbody>
      {rows.map((row) => <tr key={String(row.id)}>{columns.map((column) => <td key={column.key} data-label={column.label}>{display(row[column.key])}</td>)}<td><button className="btn-secondary" type="button" onClick={() => onEdit(row)}>Edit</button></td></tr>)}
      {!rows.length && <tr><td colSpan={columns.length + 1}>No archived records found in this bounded search page.</td></tr>}
    </tbody></table></div>
    <footer><span>{progress.objects_read.toLocaleString()} of {progress.total_objects.toLocaleString()} objects searched</span><button className="btn-secondary" type="button" disabled={!hasNext || loading} onClick={onNext}>{loading ? 'Loading…' : 'Continue'}</button></footer>
  </section>;
}
