import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Modal } from '../../components/Modal';
import { ContactEditor } from '../../components/crm/ContactEditor';
import {
  ContactLifecycleActions,
  ContactStateBadges,
  type ContactLifecycleChange,
} from '../../components/crm/ContactLifecycleControls';
import { CrmColumnPicker, useCrmColumns } from '../../components/crm/CrmColumnPicker';
import { CrmDeleteSourceDialog } from '../../components/crm/CrmDeleteSourceDialog';
import { CrmExportDialog } from '../../components/crm/CrmExportDialog';
import { CrmPagination } from '../../components/crm/CrmPagination';
import {
  CrmFilterBar,
  CrmPageHeader,
  CrmResourceState,
  CrmRowActions,
} from '../../components/crm/CrmPageChrome';
import { CrmSourceBadge } from '../../components/crm/CrmSourceBadge';
import { ErrorState } from '../../components/ui';
import { useCrmCompanyOptions } from '../../hooks/crm/useCrmCompanies';
import {
  useCrmContactLifecycle,
  useCrmContactMutations,
  useCrmContacts,
} from '../../hooks/crm/useCrmContacts';
import { useCrmSourceRows } from '../../hooks/crm/useCrmImports';
import { useActiveWorkspace } from '../../hooks/useWorkspaces';
import { outdatedContactIds } from '../../lib/crm/contactLifecycle';
import { selectPageRows, toggleSelectedRow } from '../../lib/crm/exportSelection';
import { pageAfterDelete } from '../../lib/crm/pagination';
import { canDeleteCrmRecords } from '../../lib/crm/permissions';
import { displayText, formatCrmDate } from '../../lib/crm/presenters';
import { crmRecordPath } from '../../lib/crm/salesRoutes';
import {
  clearSourceFilter,
  sourceColumnId,
  sourceHeaderFromColumnId,
  type CrmSourceFilter,
} from '../../lib/crm/sourceFilters';
import { CRM_COLUMN_OPTIONS } from '../../lib/crm/tableColumns';
import type { CrmContact, CrmContactInput } from '../../lib/crm/types';

const PAGE_SIZE = 25;
const CONTACT_EXPORT_COLUMNS = new Set([
  'full_name', 'company', 'job_title', 'email', 'phone', 'record_state', 'is_hidden',
  'duplicate_review', 'first_name', 'last_name', 'created_at', 'updated_at',
]);

export function CrmContacts() {
  const workspace = useActiveWorkspace();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [contactState, setContactState] = useState('');
  const [contactVisibility, setContactVisibility] = useState('visible');
  const [duplicateReview, setDuplicateReview] = useState('');
  const [sort, setSort] = useState('name_asc');
  const [sourceFilter, setSourceFilter] = useState<CrmSourceFilter | null>(null);
  const [editing, setEditing] = useState<CrmContact | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);

  const columnOptions = useMemo(() => [
    ...CRM_COLUMN_OPTIONS.crm_contacts,
    ...((sourceFilter?.type === 'workbook' && sourceFilter.rowIndexAvailable)
      ? (sourceFilter.headers ?? []).map((header) => ({
        id: sourceColumnId(header), label: `Original: ${header}`, group: 'source' as const,
      }))
      : []),
  ], [sourceFilter]);
  const visibleColumns = useCrmColumns('crm_contacts', columnOptions, sourceFilter?.id);
  const exportOptions = CRM_COLUMN_OPTIONS.crm_contacts.filter((option) => CONTACT_EXPORT_COLUMNS.has(option.id));
  const shows = (column: string) => visibleColumns.includes(column);
  const query = useCrmContacts(workspace.id, {
    page, search, companyId, contactState, contactVisibility, duplicateReview, sort,
    sourceImportId: sourceFilter?.id,
  });
  const rows = query.data?.rows ?? [];
  const sourceHeaders = visibleColumns
    .map(sourceHeaderFromColumnId)
    .filter((value): value is string => Boolean(value));
  const sourceRows = useCrmSourceRows(
    workspace.id,
    sourceFilter?.id ?? null,
    rows.flatMap((row) => row.source_row_number ?? []),
    sourceHeaders,
  );
  const companies = useCrmCompanyOptions(workspace.id);
  const mutations = useCrmContactMutations(workspace.id);
  const lifecycle = useCrmContactLifecycle(workspace.id);
  const selectedOutdatedIds = outdatedContactIds(rows, selectedIds);
  const canHideFiltered = selectedIds.size === 0
    && contactState === 'outdated'
    && contactVisibility !== 'hidden';
  const hideCount = selectedIds.size > 0
    ? selectedOutdatedIds.length
    : canHideFiltered
      ? query.data?.count ?? 0
      : 0;

  const resetPage = () => {
    setPage(1);
    setSelectedIds(new Set());
  };
  const closeEditor = () => {
    setEditing(undefined);
    mutations.create.reset();
    mutations.update.reset();
  };
  const save = (input: CrmContactInput) => {
    const onSuccess = closeEditor;
    if (editing) mutations.update.mutate({ id: editing.id, input }, { onSuccess });
    else mutations.create.mutate(input, { onSuccess });
  };
  const remove = (row: CrmContact) => setDeleting({
    kind: 'contact', id: row.id, label: row.full_name ?? row.email ?? 'Unnamed contact',
  });
  const updateLifecycle = (row: CrmContact, changes: ContactLifecycleChange) => {
    lifecycle.update.mutate({ id: row.id, changes });
  };
  const toggleSelected = (id: string) => setSelectedIds((current) => toggleSelectedRow(current, id));
  const togglePage = () => setSelectedIds((current) => selectPageRows(current, rows.map((row) => row.id)));
  const hideOutdated = () => {
    if (hideCount < 1) return;
    const scope = selectedIds.size > 0 ? 'selected' : 'filtered';
    if (!window.confirm(`Hide ${hideCount} ${scope} outdated contact${hideCount === 1 ? '' : 's'}? You can show them again using the Hidden filter.`)) return;
    lifecycle.hideOutdated.mutate({
      contactIds: selectedIds.size > 0 ? selectedOutdatedIds : undefined,
      search,
      companyId,
      sourceImportId: sourceFilter?.id,
      duplicateReview,
    }, {
      onSuccess: (count) => {
        setSelectedIds(new Set());
        setBulkMessage(`${count} outdated contact${count === 1 ? '' : 's'} hidden.`);
      },
    });
  };

  return (
    <div className="space-y-5">
      <CrmPageHeader
        eyebrow="People ledger"
        title="Contacts"
        description="Customer identities, roles, verification state, and working relationships to company accounts."
        action={(
          <div className="flex flex-wrap gap-2">
            <CrmExportDialog workspaceId={workspace.id} entity="contacts" options={exportOptions} defaultColumns={visibleColumns} selectedIds={selectedIds} filters={{ search, companyId, contactState, contactVisibility, duplicateReview, sourceImportId: sourceFilter?.id }} />
            <button
              type="button"
              className="btn-secondary"
              disabled={hideCount < 1 || lifecycle.hideOutdated.isPending}
              onClick={hideOutdated}
              title={hideCount < 1 ? 'Select outdated contacts or filter State to Outdated first.' : undefined}
            >
              Hide outdated{hideCount > 0 ? ` (${hideCount})` : ''}
            </button>
            <button type="button" className="btn-primary" onClick={() => setEditing(null)}>Add contact</button>
          </div>
        )}
      />
      <CrmFilterBar
        search={search}
        placeholder="Search name, role, company, phone, or email"
        onSearchChange={(value) => { setSearch(value); resetPage(); }}
      >
        <CrmColumnPicker table="crm_contacts" options={columnOptions} sourceId={sourceFilter?.id} />
        <label>
          <span className="sr-only">Company</span>
          <select className="input min-w-44" value={companyId} onChange={(event) => { setCompanyId(event.target.value); resetPage(); }}>
            <option value="">All companies</option>
            {(companies.data ?? []).map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">Contact state</span>
          <select className="input min-w-36" value={contactState} onChange={(event) => { setContactState(event.target.value); resetPage(); }}>
            <option value="">All states</option>
            <option value="unverified">Unverified</option>
            <option value="verified">Verified</option>
            <option value="outdated">Outdated</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Visibility</span>
          <select className="input min-w-36" value={contactVisibility} onChange={(event) => { setContactVisibility(event.target.value); resetPage(); }}>
            <option value="visible">Visible only</option>
            <option value="hidden">Hidden only</option>
            <option value="all">All visibility</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Duplicate review</span>
          <select className="input min-w-36" value={duplicateReview} onChange={(event) => { setDuplicateReview(event.target.value); resetPage(); }}>
            <option value="">All reviews</option>
            <option value="required">Review required</option>
            <option value="clear">No review flag</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Sort contacts</span>
          <select className="input min-w-36" value={sort} onChange={(event) => { setSort(event.target.value); resetPage(); }}>
            <option value="name_asc">Name A–Z</option>
            <option value="name_desc">Name Z–A</option>
            <option value="recent">Newest</option>
          </select>
        </label>
      </CrmFilterBar>
      {sourceFilter && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900" role="status">
          <span>Showing records from <strong>{sourceFilter.filename}</strong> ({sourceFilter.databaseId})</span>
          <button type="button" className="font-semibold underline" onClick={() => { setSourceFilter(clearSourceFilter(sourceFilter)); resetPage(); }}>Clear filter</button>
        </div>
      )}
      {bulkMessage && <p className="crm-inline-status crm-inline-status--success" role="status">{bulkMessage}</p>}
      {(mutations.remove.error || companies.error || lifecycle.update.error || lifecycle.hideOutdated.error) && (
        <ErrorState error={mutations.remove.error ?? companies.error ?? lifecycle.update.error ?? lifecycle.hideOutdated.error} />
      )}
      <CrmResourceState loading={query.isLoading} error={query.error} empty={rows.length === 0}>
        <div className="crm-table-wrap">
          <table className="crm-table">
            <thead>
              <tr>
                <th><input type="checkbox" aria-label="Select all contacts on this page" checked={rows.length > 0 && rows.every((row) => selectedIds.has(row.id))} onChange={togglePage} /></th>
                {shows('full_name') && <th>Contact</th>}
                {shows('company') && <th>Company</th>}
                {shows('job_title') && <th>Role</th>}
                {shows('email') && <th>Email</th>}
                {shows('phone') && <th>Phone</th>}
                {shows('record_state') && <th>State</th>}
                {shows('is_hidden') && <th>Visibility</th>}
                {shows('duplicate_review') && <th>Duplicate review</th>}
                {shows('first_name') && <th>First name</th>}
                {shows('last_name') && <th>Last name</th>}
                {shows('created_at') && <th>Created</th>}
                {shows('updated_at') && <th>Updated</th>}
                {shows('source') && <th>Source</th>}
                {shows('deal_count') && <th>Deals</th>}
                {shows('task_count') && <th>Tasks</th>}
                {sourceHeaders.map((header) => <th key={header}>{header}</th>)}
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td data-label="Select"><input type="checkbox" aria-label={`Select ${row.full_name ?? row.email ?? 'contact'}`} checked={selectedIds.has(row.id)} onChange={() => toggleSelected(row.id)} /></td>
                  {shows('full_name') && <td data-label="Contact"><Link className="crm-record-link font-semibold" to={crmRecordPath(workspace.id, 'contact', row.id)}>{displayText(row.full_name ?? [row.first_name, row.last_name].filter(Boolean).join(' '), 'Unnamed contact')}</Link></td>}
                  {shows('company') && <td data-label="Company">{displayText(row.company?.name)}</td>}
                  {shows('job_title') && <td data-label="Role">{displayText(row.job_title)}</td>}
                  {shows('email') && <td data-label="Email">{displayText(row.email)}</td>}
                  {shows('phone') && <td data-label="Phone">{displayText(row.phone)}</td>}
                  {shows('record_state') && <td data-label="State"><ContactStateBadges contact={row} /></td>}
                  {shows('is_hidden') && <td data-label="Visibility">{row.is_hidden ? 'Hidden' : 'Visible'}</td>}
                  {shows('duplicate_review') && <td data-label="Duplicate review">{row.duplicate_review_of ? 'Review required' : '—'}</td>}
                  {shows('first_name') && <td data-label="First name">{displayText(row.first_name)}</td>}
                  {shows('last_name') && <td data-label="Last name">{displayText(row.last_name)}</td>}
                  {shows('created_at') && <td data-label="Created">{formatCrmDate(row.created_at)}</td>}
                  {shows('updated_at') && <td data-label="Updated">{formatCrmDate(row.updated_at)}</td>}
                  {shows('source') && <td data-label="Source"><CrmSourceBadge source={row.primary_source} count={row.source_count} onSelect={(source) => { setSourceFilter(source); resetPage(); }} /></td>}
                  {shows('deal_count') && <td data-label="Deals">{row.deal_count ?? '—'}</td>}
                  {shows('task_count') && <td data-label="Tasks">{row.task_count ?? '—'}</td>}
                  {sourceHeaders.map((header) => <td data-label={header} key={header}>{displayText(sourceRows.data?.get(row.source_row_number ?? -1)?.[header])}</td>)}
                  <td data-label="Actions">
                    <div className="space-y-2">
                      <ContactLifecycleActions contact={row} pending={lifecycle.update.isPending} onChange={(changes) => updateLifecycle(row, changes)} />
                      <CrmRowActions onEdit={() => setEditing(row)} onDelete={canDeleteCrmRecords(workspace.role) ? () => remove(row) : undefined} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CrmResourceState>
      <CrmPagination page={page} pageSize={PAGE_SIZE} count={query.data?.count ?? 0} onPageChange={(next) => { setPage(next); setSelectedIds(new Set()); }} />
      <Modal open={editing !== undefined} onClose={closeEditor} title={editing ? 'Edit contact' : 'Add contact'} wide>
        <ContactEditor initial={editing} companies={companies.data ?? []} busy={mutations.create.isPending || mutations.update.isPending} error={mutations.create.error ?? mutations.update.error} onCancel={closeEditor} onSave={save} />
      </Modal>
      <CrmDeleteSourceDialog workspaceId={workspace.id} target={deleting} onClose={() => setDeleting(null)} onDeleted={() => setPage((current) => pageAfterDelete(current, rows.length))} />
    </div>
  );
}
