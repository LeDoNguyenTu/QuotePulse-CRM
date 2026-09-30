import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useActiveWorkspace } from '../../hooks/useWorkspaces';
import { useCrmDeals, useCrmDealMutations } from '../../hooks/crm/useCrmDeals';
import { useCrmCompanyOptions } from '../../hooks/crm/useCrmCompanies';
import type { CrmDeal, CrmDealInput } from '../../lib/crm/types';
import { canDeleteCrmRecords } from '../../lib/crm/permissions';
import { displayText, formatCrmDate, formatCrmMoney } from '../../lib/crm/presenters';
import { pageAfterDelete } from '../../lib/crm/pagination';
import { Modal } from '../../components/Modal';
import { ErrorState } from '../../components/ui';
import { DealEditor } from '../../components/crm/DealEditor';
import { CrmFilterBar, CrmPageHeader, CrmResourceState, CrmRowActions } from '../../components/crm/CrmPageChrome';
import { CrmPagination } from '../../components/crm/CrmPagination';
import { crmRecordPath } from '../../lib/crm/salesRoutes';
import { CrmColumnPicker, useCrmColumns } from '../../components/crm/CrmColumnPicker';
import { CRM_COLUMN_OPTIONS } from '../../lib/crm/tableColumns';

const PAGE_SIZE = 25;

export function CrmDeals() {
  const workspace = useActiveWorkspace();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [sort, setSort] = useState('recent');
  const [editing, setEditing] = useState<CrmDeal | null | undefined>(undefined);
  const visibleColumns = useCrmColumns('crm_deals');
  const shows = (column: string) => visibleColumns.includes(column);
  const query = useCrmDeals(workspace.id, { page, search, status, companyId, sort });
  const companies = useCrmCompanyOptions(workspace.id);
  const mutations = useCrmDealMutations(workspace.id);
  const closeEditor = () => { setEditing(undefined); mutations.create.reset(); mutations.update.reset(); };
  const save = (input: CrmDealInput) => {
    const onSuccess = closeEditor;
    if (editing) mutations.update.mutate({ id: editing.id, input }, { onSuccess });
    else mutations.create.mutate(input, { onSuccess });
  };
  const remove = (row: CrmDeal) => {
    if (window.confirm(`Delete ${row.name}?`)) {
      mutations.remove.mutate(row.id, { onSuccess: () => setPage((current) => pageAfterDelete(current, rows.length)) });
    }
  };
  const rows = query.data?.rows ?? [];
  return (
    <div className="space-y-5">
      <CrmPageHeader eyebrow="Pipeline ledger" title="Deals" description="Commercial opportunities with clear value, stage, status, and next action." action={<button type="button" className="btn-primary" onClick={() => setEditing(null)}>Add deal</button>} />
      <CrmFilterBar search={search} placeholder="Search deals" onSearchChange={(value) => { setSearch(value); setPage(1); }}>
        <CrmColumnPicker table="crm_deals" options={CRM_COLUMN_OPTIONS.crm_deals} />
        <label><span className="sr-only">Status</span><select className="input min-w-36" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">All statuses</option><option value="open">Open</option><option value="on_hold">On hold</option><option value="won">Won</option><option value="lost">Lost</option></select></label>
        <label><span className="sr-only">Company</span><select className="input min-w-44" value={companyId} onChange={(event) => { setCompanyId(event.target.value); setPage(1); }}><option value="">All companies</option>{(companies.data ?? []).map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
        <label><span className="sr-only">Sort deals</span><select className="input min-w-36" value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}><option value="recent">Newest</option><option value="value_desc">Value high–low</option><option value="follow_up">Follow-up date</option></select></label>
      </CrmFilterBar>
      {(mutations.remove.error || companies.error) && <ErrorState error={mutations.remove.error ?? companies.error} />}
      <CrmResourceState loading={query.isLoading} error={query.error} empty={rows.length === 0}>
        <div className="crm-table-wrap"><table className="crm-table"><thead><tr>{shows('name') && <th>Deal</th>}{shows('company') && <th>Company</th>}{shows('stage') && <th>Stage</th>}{shows('status') && <th>Status</th>}{shows('amount') && <th>Value</th>}{shows('follow_up_at') && <th>Follow up</th>}{shows('currency') && <th>Currency</th>}{shows('owner_user_id') && <th>Owner ID</th>}{shows('last_call_at') && <th>Last call</th>}{shows('created_at') && <th>Created</th>}{shows('updated_at') && <th>Updated</th>}{shows('source') && <th>Source</th>}{shows('task_count') && <th>Tasks</th>}<th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.id}>{shows('name') && <td data-label="Deal"><Link className="crm-record-link font-semibold" to={crmRecordPath(workspace.id, 'deal', row.id)}>{row.name}</Link></td>}{shows('company') && <td data-label="Company">{displayText(row.company?.name)}</td>}{shows('stage') && <td data-label="Stage">{row.stage}</td>}{shows('status') && <td data-label="Status"><span className={`crm-status crm-status--${row.status}`}>{row.status.replace('_', ' ')}</span></td>}{shows('amount') && <td data-label="Value" className="tabular-nums">{formatCrmMoney(row.amount, row.currency)}</td>}{shows('follow_up_at') && <td data-label="Follow up" className="tabular-nums">{formatCrmDate(row.follow_up_at)}</td>}{shows('currency') && <td data-label="Currency">{row.currency}</td>}{shows('owner_user_id') && <td data-label="Owner ID">{displayText(row.owner_user_id)}</td>}{shows('last_call_at') && <td data-label="Last call" className="tabular-nums">{formatCrmDate(row.last_call_at)}</td>}{shows('created_at') && <td data-label="Created">{formatCrmDate(row.created_at)}</td>}{shows('updated_at') && <td data-label="Updated">{formatCrmDate(row.updated_at)}</td>}{shows('source') && <td data-label="Source">{displayText(row.primary_source?.filename)}</td>}{shows('task_count') && <td data-label="Tasks">{row.task_count ?? '—'}</td>}<td data-label="Actions"><CrmRowActions onEdit={() => setEditing(row)} onDelete={canDeleteCrmRecords(workspace.role) ? () => remove(row) : undefined} /></td></tr>)}</tbody>
        </table></div>
      </CrmResourceState>
      <CrmPagination page={page} pageSize={PAGE_SIZE} count={query.data?.count ?? 0} onPageChange={setPage} />
      <Modal open={editing !== undefined} onClose={closeEditor} title={editing ? 'Edit deal' : 'Add deal'} wide><DealEditor initial={editing} companies={companies.data ?? []} busy={mutations.create.isPending || mutations.update.isPending} error={mutations.create.error ?? mutations.update.error} onCancel={closeEditor} onSave={save} /></Modal>
    </div>
  );
}
