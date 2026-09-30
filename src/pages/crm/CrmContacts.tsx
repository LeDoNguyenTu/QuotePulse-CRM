import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useActiveWorkspace } from '../../hooks/useWorkspaces';
import { useCrmContacts, useCrmContactMutations } from '../../hooks/crm/useCrmContacts';
import { useCrmCompanyOptions } from '../../hooks/crm/useCrmCompanies';
import type { CrmContact, CrmContactInput } from '../../lib/crm/types';
import { canDeleteCrmRecords } from '../../lib/crm/permissions';
import { displayText, formatCrmDate } from '../../lib/crm/presenters';
import { pageAfterDelete } from '../../lib/crm/pagination';
import { Modal } from '../../components/Modal';
import { ErrorState } from '../../components/ui';
import { ContactEditor } from '../../components/crm/ContactEditor';
import { CrmFilterBar, CrmPageHeader, CrmResourceState, CrmRowActions } from '../../components/crm/CrmPageChrome';
import { CrmPagination } from '../../components/crm/CrmPagination';
import { crmRecordPath } from '../../lib/crm/salesRoutes';
import { CrmColumnPicker, useCrmColumns } from '../../components/crm/CrmColumnPicker';
import { CRM_COLUMN_OPTIONS } from '../../lib/crm/tableColumns';

const PAGE_SIZE = 25;

export function CrmContacts() {
  const workspace = useActiveWorkspace();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [sort, setSort] = useState('name_asc');
  const [editing, setEditing] = useState<CrmContact | null | undefined>(undefined);
  const visibleColumns = useCrmColumns('crm_contacts');
  const shows = (column: string) => visibleColumns.includes(column);
  const query = useCrmContacts(workspace.id, { page, search, companyId, sort });
  const companies = useCrmCompanyOptions(workspace.id);
  const mutations = useCrmContactMutations(workspace.id);
  const closeEditor = () => { setEditing(undefined); mutations.create.reset(); mutations.update.reset(); };
  const save = (input: CrmContactInput) => {
    const onSuccess = closeEditor;
    if (editing) mutations.update.mutate({ id: editing.id, input }, { onSuccess });
    else mutations.create.mutate(input, { onSuccess });
  };
  const remove = (row: CrmContact) => {
    const name = row.full_name ?? row.email ?? 'this contact';
    if (window.confirm(`Delete ${name}?`)) {
      mutations.remove.mutate(row.id, { onSuccess: () => setPage((current) => pageAfterDelete(current, rows.length)) });
    }
  };
  const rows = query.data?.rows ?? [];
  return (
    <div className="space-y-5">
      <CrmPageHeader eyebrow="People ledger" title="Contacts" description="Customer identities and their working relationships to company accounts." action={<button type="button" className="btn-primary" onClick={() => setEditing(null)}>Add contact</button>} />
      <CrmFilterBar search={search} placeholder="Search contacts by name" onSearchChange={(value) => { setSearch(value); setPage(1); }}>
        <CrmColumnPicker table="crm_contacts" options={CRM_COLUMN_OPTIONS.crm_contacts} />
        <label><span className="sr-only">Company</span><select className="input min-w-44" value={companyId} onChange={(event) => { setCompanyId(event.target.value); setPage(1); }}><option value="">All companies</option>{(companies.data ?? []).map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
        <label><span className="sr-only">Sort contacts</span><select className="input min-w-36" value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}><option value="name_asc">Name A–Z</option><option value="name_desc">Name Z–A</option><option value="recent">Newest</option></select></label>
      </CrmFilterBar>
      {(mutations.remove.error || companies.error) && <ErrorState error={mutations.remove.error ?? companies.error} />}
      <CrmResourceState loading={query.isLoading} error={query.error} empty={rows.length === 0}>
        <div className="crm-table-wrap"><table className="crm-table"><thead><tr>{shows('full_name') && <th>Contact</th>}{shows('company') && <th>Company</th>}{shows('job_title') && <th>Role</th>}{shows('email') && <th>Email</th>}{shows('phone') && <th>Phone</th>}{shows('first_name') && <th>First name</th>}{shows('last_name') && <th>Last name</th>}{shows('created_at') && <th>Created</th>}{shows('updated_at') && <th>Updated</th>}{shows('source') && <th>Source</th>}{shows('deal_count') && <th>Deals</th>}{shows('task_count') && <th>Tasks</th>}<th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.id}>{shows('full_name') && <td data-label="Contact"><Link className="crm-record-link font-semibold" to={crmRecordPath(workspace.id, 'contact', row.id)}>{displayText(row.full_name ?? [row.first_name, row.last_name].filter(Boolean).join(' '), 'Unnamed contact')}</Link></td>}{shows('company') && <td data-label="Company">{displayText(row.company?.name)}</td>}{shows('job_title') && <td data-label="Role">{displayText(row.job_title)}</td>}{shows('email') && <td data-label="Email">{displayText(row.email)}</td>}{shows('phone') && <td data-label="Phone">{displayText(row.phone)}</td>}{shows('first_name') && <td data-label="First name">{displayText(row.first_name)}</td>}{shows('last_name') && <td data-label="Last name">{displayText(row.last_name)}</td>}{shows('created_at') && <td data-label="Created">{formatCrmDate(row.created_at)}</td>}{shows('updated_at') && <td data-label="Updated">{formatCrmDate(row.updated_at)}</td>}{shows('source') && <td data-label="Source">{displayText(row.primary_source?.filename)}</td>}{shows('deal_count') && <td data-label="Deals">{row.deal_count ?? '—'}</td>}{shows('task_count') && <td data-label="Tasks">{row.task_count ?? '—'}</td>}<td data-label="Actions"><CrmRowActions onEdit={() => setEditing(row)} onDelete={canDeleteCrmRecords(workspace.role) ? () => remove(row) : undefined} /></td></tr>)}</tbody>
        </table></div>
      </CrmResourceState>
      <CrmPagination page={page} pageSize={PAGE_SIZE} count={query.data?.count ?? 0} onPageChange={setPage} />
      <Modal open={editing !== undefined} onClose={closeEditor} title={editing ? 'Edit contact' : 'Add contact'} wide><ContactEditor initial={editing} companies={companies.data ?? []} busy={mutations.create.isPending || mutations.update.isPending} error={mutations.create.error ?? mutations.update.error} onCancel={closeEditor} onSave={save} /></Modal>
    </div>
  );
}
