import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CrmColumnPicker, useCrmColumns } from '../../components/crm/CrmColumnPicker';
import { CrmDeleteSourceDialog } from '../../components/crm/CrmDeleteSourceDialog';
import { CrmExportDialog } from '../../components/crm/CrmExportDialog';
import { CrmPagination } from '../../components/crm/CrmPagination';
import { CrmFilterBar, CrmPageHeader, CrmResourceState, CrmRowActions } from '../../components/crm/CrmPageChrome';
import { CrmSourceBadge } from '../../components/crm/CrmSourceBadge';
import { DealEditor } from '../../components/crm/DealEditor';
import { Modal } from '../../components/Modal';
import { ErrorState } from '../../components/ui';
import { useCrmCompanyOptions } from '../../hooks/crm/useCrmCompanies';
import { useCrmDeals, useCrmDealMutations } from '../../hooks/crm/useCrmDeals';
import { useCrmSourceRows } from '../../hooks/crm/useCrmImports';
import { useActiveWorkspace } from '../../hooks/useWorkspaces';
import { pageAfterDelete } from '../../lib/crm/pagination';
import { selectPageRows, toggleSelectedRow } from '../../lib/crm/exportSelection';
import { canDeleteCrmRecords } from '../../lib/crm/permissions';
import { displayText, formatCrmDate, formatCrmMoney } from '../../lib/crm/presenters';
import { crmRecordPath } from '../../lib/crm/salesRoutes';
import { clearSourceFilter, sourceColumnId, sourceHeaderFromColumnId, type CrmSourceFilter } from '../../lib/crm/sourceFilters';
import { CRM_COLUMN_OPTIONS } from '../../lib/crm/tableColumns';
import type { CrmDeal, CrmDealInput } from '../../lib/crm/types';

const PAGE_SIZE = 25;
const DEAL_EXPORT_COLUMNS = new Set([
  'name', 'company', 'stage', 'status', 'amount', 'follow_up_at', 'call_outcome',
  'appointment_status', 'currency', 'owner_user_id', 'last_call_at', 'created_at', 'updated_at',
]);

export function CrmDeals() {
  const workspace = useActiveWorkspace();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [sort, setSort] = useState('recent');
  const [sourceFilter, setSourceFilter] = useState<CrmSourceFilter | null>(null);
  const [editing, setEditing] = useState<CrmDeal | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const columnOptions = useMemo(() => [
    ...CRM_COLUMN_OPTIONS.crm_deals,
    ...((sourceFilter?.type === 'workbook' && sourceFilter.rowIndexAvailable)
      ? (sourceFilter.headers ?? []).map((header) => ({ id: sourceColumnId(header), label: `Original: ${header}`, group: 'source' as const }))
      : []),
  ], [sourceFilter]);
  const visibleColumns = useCrmColumns('crm_deals', columnOptions, sourceFilter?.id);
  const exportOptions = CRM_COLUMN_OPTIONS.crm_deals.filter((option) => DEAL_EXPORT_COLUMNS.has(option.id));
  const shows = (column: string) => visibleColumns.includes(column);
  const query = useCrmDeals(workspace.id, { page, search, status, companyId, sort, sourceImportId: sourceFilter?.id });
  const rows = query.data?.rows ?? [];
  const sourceHeaders = visibleColumns.map(sourceHeaderFromColumnId).filter((value): value is string => Boolean(value));
  const sourceRows = useCrmSourceRows(workspace.id, sourceFilter?.id ?? null, rows.flatMap((row) => row.source_row_number ?? []), sourceHeaders);
  const companies = useCrmCompanyOptions(workspace.id);
  const mutations = useCrmDealMutations(workspace.id);
  const closeEditor = () => { setEditing(undefined); mutations.create.reset(); mutations.update.reset(); };
  const save = (input: CrmDealInput) => {
    const onSuccess = closeEditor;
    if (editing) mutations.update.mutate({ id: editing.id, input }, { onSuccess });
    else mutations.create.mutate(input, { onSuccess });
  };
  const remove = (row: CrmDeal) => setDeleting({ kind: 'deal', id: row.id, label: row.name });

  return (
    <div className="space-y-5">
      <CrmPageHeader eyebrow="Pipeline ledger" title="Deals" description="Commercial opportunities with independent deal stage, call outcome, appointment status, and next action." action={<div className="flex flex-wrap gap-2"><CrmExportDialog workspaceId={workspace.id} entity="deals" options={exportOptions} defaultColumns={visibleColumns} selectedIds={selectedIds} filters={{ search, status, companyId, sourceImportId: sourceFilter?.id }} /><button type="button" className="btn-primary" onClick={() => setEditing(null)}>Add deal</button></div>} />
      <CrmFilterBar search={search} placeholder="Search deals" onSearchChange={(value) => { setSearch(value); setPage(1); }}>
        <CrmColumnPicker table="crm_deals" options={columnOptions} sourceId={sourceFilter?.id} />
        <label><span className="sr-only">Status</span><select className="input min-w-36" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">All statuses</option><option value="open">Open</option><option value="on_hold">On hold</option><option value="won">Won</option><option value="lost">Lost</option></select></label>
        <label><span className="sr-only">Company</span><select className="input min-w-44" value={companyId} onChange={(event) => { setCompanyId(event.target.value); setPage(1); }}><option value="">All companies</option>{(companies.data ?? []).map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
        <label><span className="sr-only">Sort deals</span><select className="input min-w-36" value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}><option value="recent">Newest</option><option value="value_desc">Value high–low</option><option value="follow_up">Follow-up date</option></select></label>
      </CrmFilterBar>
      {sourceFilter && <div className="flex items-center justify-between gap-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900" role="status"><span>Showing records from <strong>{sourceFilter.filename}</strong> ({sourceFilter.databaseId})</span><button type="button" className="font-semibold underline" onClick={() => { setSourceFilter(clearSourceFilter(sourceFilter)); setPage(1); }}>Clear filter</button></div>}
      {(mutations.remove.error || companies.error) && <ErrorState error={mutations.remove.error ?? companies.error} />}
      <CrmResourceState loading={query.isLoading} error={query.error} empty={rows.length === 0}>
        <div className="crm-table-wrap">
          <table className="crm-table">
            <thead><tr>
              <th><input type="checkbox" aria-label="Select all deals on this page" checked={rows.length > 0 && rows.every((row) => selectedIds.has(row.id))} onChange={() => setSelectedIds((current) => selectPageRows(current, rows.map((row) => row.id)))} /></th>
              {shows('name') && <th>Deal</th>}{shows('company') && <th>Company</th>}{shows('stage') && <th>Deal stage</th>}{shows('status') && <th>Status</th>}{shows('amount') && <th>Value</th>}{shows('follow_up_at') && <th>Follow up</th>}{shows('call_outcome') && <th>Call outcome</th>}{shows('appointment_status') && <th>Appointment status</th>}{shows('currency') && <th>Currency</th>}{shows('owner_user_id') && <th>Owner ID</th>}{shows('last_call_at') && <th>Last call</th>}{shows('created_at') && <th>Created</th>}{shows('updated_at') && <th>Updated</th>}{shows('source') && <th>Source</th>}{shows('task_count') && <th>Tasks</th>}{sourceHeaders.map((header) => <th key={header}>{header}</th>)}<th><span className="sr-only">Actions</span></th>
            </tr></thead>
            <tbody>{rows.map((row) => <tr key={row.id}>
              <td data-label="Select"><input type="checkbox" aria-label={`Select ${row.name}`} checked={selectedIds.has(row.id)} onChange={() => setSelectedIds((current) => toggleSelectedRow(current, row.id))} /></td>
              {shows('name') && <td data-label="Deal"><Link className="crm-record-link font-semibold" to={crmRecordPath(workspace.id, 'deal', row.id)}>{row.name}</Link></td>}{shows('company') && <td data-label="Company">{displayText(row.company?.name)}</td>}{shows('stage') && <td data-label="Deal stage">{row.stage}</td>}{shows('status') && <td data-label="Status"><span className={`crm-status crm-status--${row.status}`}>{row.status.replace('_', ' ')}</span></td>}{shows('amount') && <td data-label="Value" className="tabular-nums">{formatCrmMoney(row.amount, row.currency)}</td>}{shows('follow_up_at') && <td data-label="Follow up" className="tabular-nums">{formatCrmDate(row.follow_up_at)}</td>}{shows('call_outcome') && <td data-label="Call outcome">{displayText(row.call_outcome)}</td>}{shows('appointment_status') && <td data-label="Appointment status">{displayText(row.appointment_status)}</td>}{shows('currency') && <td data-label="Currency">{row.currency}</td>}{shows('owner_user_id') && <td data-label="Owner ID">{displayText(row.owner_user_id)}</td>}{shows('last_call_at') && <td data-label="Last call" className="tabular-nums">{formatCrmDate(row.last_call_at)}</td>}{shows('created_at') && <td data-label="Created">{formatCrmDate(row.created_at)}</td>}{shows('updated_at') && <td data-label="Updated">{formatCrmDate(row.updated_at)}</td>}{shows('source') && <td data-label="Source"><CrmSourceBadge source={row.primary_source} count={row.source_count} onSelect={(source) => { setSourceFilter(source); setPage(1); }} /></td>}{shows('task_count') && <td data-label="Tasks">{row.task_count ?? '—'}</td>}{sourceHeaders.map((header) => <td data-label={header} key={header}>{displayText(sourceRows.data?.get(row.source_row_number ?? -1)?.[header])}</td>)}<td data-label="Actions"><CrmRowActions onEdit={() => setEditing(row)} onDelete={canDeleteCrmRecords(workspace.role) ? () => remove(row) : undefined} /></td>
            </tr>)}</tbody>
          </table>
        </div>
      </CrmResourceState>
      <CrmPagination page={page} pageSize={PAGE_SIZE} count={query.data?.count ?? 0} onPageChange={(next) => { setPage(next); setSelectedIds(new Set()); }} />
      <Modal open={editing !== undefined} onClose={closeEditor} title={editing ? 'Edit deal' : 'Add deal'} wide><DealEditor initial={editing} companies={companies.data ?? []} busy={mutations.create.isPending || mutations.update.isPending} error={mutations.create.error ?? mutations.update.error} onCancel={closeEditor} onSave={save} /></Modal>
      <CrmDeleteSourceDialog workspaceId={workspace.id} target={deleting} onClose={() => setDeleting(null)} onDeleted={() => setPage((current) => pageAfterDelete(current, rows.length))} />
    </div>
  );
}
