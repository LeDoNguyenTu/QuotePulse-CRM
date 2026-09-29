import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useActiveWorkspace } from '../../hooks/useWorkspaces';
import { useCrmCompanies, useCrmCompanyMutations, useCrmIndustryOptions } from '../../hooks/crm/useCrmCompanies';
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
import { CrmColumnPicker, useCrmColumns } from '../../components/crm/CrmColumnPicker';
import { CRM_COLUMN_OPTIONS } from '../../lib/crm/tableColumns';

const PAGE_SIZE = 25;

export function CrmCompanies() {
  const workspace = useActiveWorkspace();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [industry, setIndustry] = useState('');
  const [sort, setSort] = useState('name_asc');
  const [editing, setEditing] = useState<CrmCompany | null | undefined>(undefined);
  const visibleColumns = useCrmColumns('crm_companies');
  const shows = (column: string) => visibleColumns.includes(column);
  const query = useCrmCompanies(workspace.id, { page, search, industry, sort });
  const industries = useCrmIndustryOptions(workspace.id);
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
      <CrmFilterBar search={search} placeholder="Search companies" onSearchChange={(value) => { setSearch(value); setPage(1); }}>
        <CrmColumnPicker table="crm_companies" options={CRM_COLUMN_OPTIONS.crm_companies} />
        <label><span className="sr-only">Industry</span><select className="input min-w-40" value={industry} onChange={(event) => { setIndustry(event.target.value); setPage(1); }}><option value="">All industries</option>{(industries.data ?? []).map((value) => <option key={value}>{value}</option>)}</select></label>
        <label><span className="sr-only">Sort companies</span><select className="input min-w-36" value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}><option value="name_asc">Name A–Z</option><option value="name_desc">Name Z–A</option><option value="recent">Newest</option></select></label>
      </CrmFilterBar>
      {(mutations.remove.error || industries.error) && <ErrorState error={mutations.remove.error ?? industries.error} />}
      <CrmResourceState loading={query.isLoading} error={query.error} empty={rows.length === 0}>
        <div className="crm-table-wrap">
          <table className="crm-table"><thead><tr>{shows('name') && <th>Company</th>}{shows('industry') && <th>Industry</th>}{shows('location') && <th>Location</th>}{shows('phone') && <th>Phone</th>}{shows('website') && <th>Website</th>}{shows('domain') && <th>Domain</th>}<th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{rows.map((row) => <tr key={row.id}>{shows('name') && <td data-label="Company"><Link className="crm-record-link font-semibold" to={crmRecordPath(workspace.id, 'company', row.id)}>{row.name}</Link></td>}{shows('industry') && <td data-label="Industry">{displayText(row.industry)}</td>}{shows('location') && <td data-label="Location">{displayText([row.city, row.country].filter(Boolean).join(', '))}</td>}{shows('phone') && <td data-label="Phone">{displayText(row.phone)}</td>}{shows('website') && <td data-label="Website">{displayText(row.website)}</td>}{shows('domain') && <td data-label="Domain">{displayText(row.domain)}</td>}<td data-label="Actions"><CrmRowActions onEdit={() => setEditing(row)} onDelete={canDeleteCrmRecords(workspace.role) ? () => remove(row) : undefined} /></td></tr>)}</tbody>
          </table>
        </div>
      </CrmResourceState>
      <CrmPagination page={page} pageSize={PAGE_SIZE} count={query.data?.count ?? 0} onPageChange={setPage} />
      <Modal open={editing !== undefined} onClose={closeEditor} title={editing ? 'Edit company' : 'Add company'} wide><CompanyEditor initial={editing} busy={mutations.create.isPending || mutations.update.isPending} error={mutations.create.error ?? mutations.update.error} onCancel={closeEditor} onSave={save} /></Modal>
    </div>
  );
}
