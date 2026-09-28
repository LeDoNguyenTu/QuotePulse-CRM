import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useActiveWorkspace } from '../../hooks/useWorkspaces';
import { useCrmCompanies, useCrmCompanyMutations } from '../../hooks/crm/useCrmCompanies';
import type { CrmCompany, CrmCompanyInput } from '../../lib/crm/types';
import { canDeleteCrmRecords } from '../../lib/crm/permissions';
import { displayText } from '../../lib/crm/presenters';
import { pageAfterDelete } from '../../lib/crm/pagination';
import { Modal } from '../../components/Modal';
import { ErrorState } from '../../components/ui';
import { CompanyEditor } from '../../components/crm/CompanyEditor';
import { CrmFilterBar, CrmPageHeader, CrmResourceState, CrmRowActions } from '../../components/crm/CrmPageChrome';
import { CrmPagination } from '../../components/crm/CrmPagination';
import { crmRecordPath } from '../../lib/crm/salesRoutes';

const PAGE_SIZE = 25;

export function CrmCompanies() {
  const workspace = useActiveWorkspace();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<CrmCompany | null | undefined>(undefined);
  const query = useCrmCompanies(workspace.id, { page, search });
  const mutations = useCrmCompanyMutations(workspace.id);
  const closeEditor = () => { setEditing(undefined); mutations.create.reset(); mutations.update.reset(); };
  const save = (input: CrmCompanyInput) => {
    const onSuccess = closeEditor;
    if (editing) mutations.update.mutate({ id: editing.id, input }, { onSuccess });
    else mutations.create.mutate(input, { onSuccess });
  };
  const remove = (row: CrmCompany) => {
    if (window.confirm(`Delete ${row.name}? Related contacts and deals will keep their records without this company.`)) {
      mutations.remove.mutate(row.id, { onSuccess: () => setPage((current) => pageAfterDelete(current, rows.length)) });
    }
  };
  const rows = query.data?.rows ?? [];
  return (
    <div className="space-y-5">
      <CrmPageHeader eyebrow="Account ledger" title="Companies" description="The durable account directory for contacts, deals, and future import lineage." action={<button type="button" className="btn-primary" onClick={() => setEditing(null)}>Add company</button>} />
      <CrmFilterBar search={search} placeholder="Search companies" onSearchChange={(value) => { setSearch(value); setPage(1); }} />
      {mutations.remove.error && <ErrorState error={mutations.remove.error} />}
      <CrmResourceState loading={query.isLoading} error={query.error} empty={rows.length === 0}>
        <div className="crm-table-wrap">
          <table className="crm-table"><thead><tr><th>Company</th><th>Industry</th><th>Location</th><th>Contact</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{rows.map((row) => <tr key={row.id}><td data-label="Company"><Link className="crm-record-link font-semibold" to={crmRecordPath(workspace.id, 'company', row.id)}>{row.name}</Link><div className="crm-secondary">{displayText(row.domain)}</div></td><td data-label="Industry">{displayText(row.industry)}</td><td data-label="Location">{displayText([row.city, row.country].filter(Boolean).join(', '))}</td><td data-label="Contact"><div>{displayText(row.phone)}</div><div className="crm-secondary">{displayText(row.website)}</div></td><td data-label="Actions"><CrmRowActions onEdit={() => setEditing(row)} onDelete={canDeleteCrmRecords(workspace.role) ? () => remove(row) : undefined} /></td></tr>)}</tbody>
          </table>
        </div>
      </CrmResourceState>
      <CrmPagination page={page} pageSize={PAGE_SIZE} count={query.data?.count ?? 0} onPageChange={setPage} />
      <Modal open={editing !== undefined} onClose={closeEditor} title={editing ? 'Edit company' : 'Add company'} wide><CompanyEditor initial={editing} busy={mutations.create.isPending || mutations.update.isPending} error={mutations.create.error ?? mutations.update.error} onCancel={closeEditor} onSave={save} /></Modal>
    </div>
  );
}
