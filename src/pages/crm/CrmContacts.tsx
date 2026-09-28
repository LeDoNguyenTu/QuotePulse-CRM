import { useState } from 'react';
import { useActiveWorkspace } from '../../hooks/useWorkspaces';
import { useCrmContacts, useCrmContactMutations } from '../../hooks/crm/useCrmContacts';
import { useCrmCompanyOptions } from '../../hooks/crm/useCrmCompanies';
import type { CrmContact, CrmContactInput } from '../../lib/crm/types';
import { canDeleteCrmRecords } from '../../lib/crm/permissions';
import { displayText } from '../../lib/crm/presenters';
import { pageAfterDelete } from '../../lib/crm/pagination';
import { Modal } from '../../components/Modal';
import { ErrorState } from '../../components/ui';
import { ContactEditor } from '../../components/crm/ContactEditor';
import { CrmFilterBar, CrmPageHeader, CrmResourceState, CrmRowActions } from '../../components/crm/CrmPageChrome';
import { CrmPagination } from '../../components/crm/CrmPagination';

const PAGE_SIZE = 25;

export function CrmContacts() {
  const workspace = useActiveWorkspace();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<CrmContact | null | undefined>(undefined);
  const query = useCrmContacts(workspace.id, { page, search });
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
      <CrmFilterBar search={search} placeholder="Search contacts by name" onSearchChange={(value) => { setSearch(value); setPage(1); }} />
      {(mutations.remove.error || companies.error) && <ErrorState error={mutations.remove.error ?? companies.error} />}
      <CrmResourceState loading={query.isLoading} error={query.error} empty={rows.length === 0}>
        <div className="crm-table-wrap"><table className="crm-table"><thead><tr><th>Contact</th><th>Company</th><th>Role</th><th>Reach</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.id}><td data-label="Contact"><div className="font-semibold text-slate-950">{displayText(row.full_name ?? [row.first_name, row.last_name].filter(Boolean).join(' '), 'Unnamed contact')}</div><div className="crm-secondary">{displayText(row.email)}</div></td><td data-label="Company">{displayText(row.company?.name)}</td><td data-label="Role">{displayText(row.job_title)}</td><td data-label="Reach">{displayText(row.phone)}</td><td data-label="Actions"><CrmRowActions onEdit={() => setEditing(row)} onDelete={canDeleteCrmRecords(workspace.role) ? () => remove(row) : undefined} /></td></tr>)}</tbody>
        </table></div>
      </CrmResourceState>
      <CrmPagination page={page} pageSize={PAGE_SIZE} count={query.data?.count ?? 0} onPageChange={setPage} />
      <Modal open={editing !== undefined} onClose={closeEditor} title={editing ? 'Edit contact' : 'Add contact'} wide><ContactEditor initial={editing} companies={companies.data ?? []} busy={mutations.create.isPending || mutations.update.isPending} error={mutations.create.error ?? mutations.update.error} onCancel={closeEditor} onSave={save} /></Modal>
    </div>
  );
}
