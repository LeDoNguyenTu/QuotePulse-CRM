import { Fragment, useState } from 'react';
import { useArchivedCompanyBundle } from '../../hooks/useArchivedCompanyBundle';
import { archiveCellValue, type ArchiveColumn } from '../../lib/archiveTable';
import type { ArchivedLegacyTable } from '../../lib/functions';

type ArchiveRow = Record<string, unknown> & { id: string; _archive_cursor: string };

interface Props {
  workspaceId: string;
  archiveId: string;
  rows: ArchiveRow[];
  columnOptions: ArchiveColumn[];
  visibleColumns: string[];
  archivedAt: string | null;
  progress: { objects_read: number; total_objects: number; total_rows: number };
  page: number;
  hasPrevious: boolean;
  hasNext: boolean;
  loading: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onRestore: (table: ArchivedLegacyTable, row: ArchiveRow) => void;
}

const DATE_COLUMNS = new Set(['created_at', 'updated_at', 'last_deal_at', 'last_hubspot_created_at', 'last_hubspot_modified_at']);

function display(value: unknown, columnId?: string) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return value.toLocaleString();
  if (columnId && DATE_COLUMNS.has(columnId) && typeof value === 'string') return new Date(value).toLocaleDateString();
  if (columnId === 'source_priority' && typeof value === 'string') return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function RestoreButton({ table, row, onRestore, disabled }: { table: ArchivedLegacyTable; row: ArchiveRow; onRestore: Props['onRestore']; disabled: boolean }) {
  return <button className="btn-secondary whitespace-nowrap" type="button" disabled={disabled} onClick={(event) => { event.stopPropagation(); onRestore(table, row); }}>Restore to edit</button>;
}

function CompanyRelationships({ workspaceId, archiveId, companyId, loading, onRestore }: { workspaceId: string; archiveId: string; companyId: string; loading: boolean; onRestore: Props['onRestore'] }) {
  const bundle = useArchivedCompanyBundle({ workspaceId, archiveId, companyId, enabled: true });
  if (bundle.error) return <p className="archive-related-status archive-related-status--error" role="alert">{bundle.error.message}</p>;
  if (bundle.isLoading || !bundle.data) return <p className="archive-related-status">Loading linked contacts and deals…</p>;
  if (bundle.data.status === 'building') {
    const { objects_indexed: indexed, total_objects: total } = bundle.data.progress;
    return <div className="archive-related-status" aria-live="polite">
      <strong>Linking archived contacts and deals…</strong>
      <span>{indexed.toLocaleString()} of {total.toLocaleString()} archive objects indexed</span>
      <progress max={Math.max(1, total)} value={indexed} />
    </div>;
  }
  return <div className="archive-related-grid">
    <section className="archive-related-section" aria-label="Archived contacts">
      <header><h3>Contacts</h3><span>{bundle.data.contacts.length}</span></header>
      {bundle.data.contacts.length ? <div className="archive-related-table-wrap"><table><thead><tr><th>Name</th><th>Role</th><th>Email</th><th>Phone</th><th>Access</th></tr></thead><tbody>
        {bundle.data.contacts.map((record) => <tr key={record.id}><td>{display(record.full_name)}</td><td>{display(record.role_title)}</td><td>{display(record.email)}</td><td>{display(record.phone)}</td><td><RestoreButton table="contacts" row={record} onRestore={onRestore} disabled={loading} /></td></tr>)}
      </tbody></table></div> : <p className="archive-related-empty">No archived contacts are linked to this company.</p>}
    </section>
    <section className="archive-related-section" aria-label="Archived deals">
      <header><h3>Deals</h3><span>{bundle.data.deals.length}</span></header>
      {bundle.data.deals.length ? <div className="archive-related-table-wrap"><table><thead><tr><th>Product</th><th>Deal</th><th>Stage</th><th>Amount</th><th>Access</th></tr></thead><tbody>
        {bundle.data.deals.map((record) => <tr key={record.id}><td>{display(record.product)}</td><td>{display(record.deal_name_raw)}</td><td>{display(record.deal_stage)}</td><td>{display(record.amount)}</td><td><RestoreButton table="deals" row={record} onRestore={onRestore} disabled={loading} /></td></tr>)}
      </tbody></table></div> : <p className="archive-related-empty">No archived deals are linked to this company.</p>}
    </section>
  </div>;
}

export function ArchivedCompanyLedger({ workspaceId, archiveId, rows, columnOptions, visibleColumns, archivedAt, progress, page, hasPrevious, hasNext, loading, onPrevious, onNext, onRestore }: Props) {
  const [expandedCompanyId, setExpandedCompanyId] = useState<string>();
  const columns = columnOptions.filter((column) => visibleColumns.includes(column.id));
  return <section className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
      <div className="flex flex-wrap items-center gap-2"><span className="crm-archive-badge">Read-only R2 archive</span><span>{archivedAt ? `Archived ${new Date(archivedAt).toLocaleString()}` : 'Verified archive'}</span></div>
      <span>{progress.total_rows.toLocaleString()} companies</span>
    </div>
    <div className="card archive-company-ledger">
      <table className="min-w-full text-sm"><thead><tr>{columns.map((column) => <th key={column.id}>{column.label}</th>)}<th>Contacts &amp; deals</th><th className="text-right">Access</th></tr></thead><tbody>
        {rows.map((row) => {
          const open = expandedCompanyId === row.id;
          return <Fragment key={row.id}><tr className="archive-company-row">
            {columns.map((column) => { const rendered = display(archiveCellValue(row, column.id), column.id); return <td key={column.id} title={rendered === '—' ? '' : rendered}>{rendered}</td>; })}
            <td><button type="button" className="archive-company-disclosure" aria-expanded={open} onClick={(event) => { event.stopPropagation(); setExpandedCompanyId(open ? undefined : row.id); }}><span>{open ? 'Hide linked records' : 'View linked records'}</span><span aria-hidden="true">{open ? '−' : '+'}</span></button></td>
            <td className="text-right"><RestoreButton table="companies" row={row} onRestore={onRestore} disabled={loading} /></td>
          </tr>{open && <tr className="archive-company-related-row"><td colSpan={columns.length + 2}><CompanyRelationships workspaceId={workspaceId} archiveId={archiveId} companyId={row.id} loading={loading} onRestore={onRestore} /></td></tr>}</Fragment>;
        })}
      </tbody></table>
      {!rows.length && <div className="p-8 text-center text-sm text-slate-500">No archived companies found.</div>}
      {loading && <div className="archive-company-loading" aria-live="polite"><span>Loading archived companies…</span></div>}
    </div>
    <footer className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600"><span>{progress.objects_read.toLocaleString()} of {progress.total_objects.toLocaleString()} archive objects searched · page {page + 1}</span><div className="flex gap-2"><button className="btn-secondary" type="button" disabled={!hasPrevious || loading} onClick={onPrevious}>Prev</button><button className="btn-secondary" type="button" disabled={!hasNext || loading} onClick={onNext}>{loading ? 'Loading…' : 'Next'}</button></div></footer>
  </section>;
}
