import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useActiveWorkspace } from '../../hooks/useWorkspaces';
import { useCrmCompanies, useCrmCompanyEnrichment, useCrmCompanyMutations, useCrmIndustryOptions } from '../../hooks/crm/useCrmCompanies';
import type { CrmCompany, CrmCompanyInput } from '../../lib/crm/types';
import { canDeleteCrmRecords } from '../../lib/crm/permissions';
import { displayText, formatCrmDate } from '../../lib/crm/presenters';
import { pageAfterDelete } from '../../lib/crm/pagination';
import { Modal } from '../../components/Modal';
import { ErrorState } from '../../components/ui';
import { CompanyEditor } from '../../components/crm/CompanyEditor';
import { CrmFilterBar, CrmPageHeader, CrmResourceState, CrmRowActions } from '../../components/crm/CrmPageChrome';
import { CrmPagination } from '../../components/crm/CrmPagination';
import { crmRecordPath } from '../../lib/crm/salesRoutes';
import { CrmColumnPicker, useCrmColumns } from '../../components/crm/CrmColumnPicker';
import { CRM_COLUMN_OPTIONS } from '../../lib/crm/tableColumns';
import { CrmSourceBadge } from '../../components/crm/CrmSourceBadge';
import { clearSourceFilter, sourceColumnId, sourceHeaderFromColumnId, type CrmSourceFilter } from '../../lib/crm/sourceFilters';
import { useCrmSourceRows } from '../../hooks/crm/useCrmImports';
import { fieldSourceLabel, normalizeCompanyIds, type CompanyFieldSources } from '../../lib/crm/companyEnrichment';

const PAGE_SIZE = 25;

export function CrmCompanies() {
  const workspace = useActiveWorkspace();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [industry, setIndustry] = useState('');
  const [sort, setSort] = useState('name_asc');
  const [sourceFilter, setSourceFilter] = useState<CrmSourceFilter | null>(null);
  const [editing, setEditing] = useState<CrmCompany | null | undefined>(undefined);
  const columnOptions = useMemo(() => [
    ...CRM_COLUMN_OPTIONS.crm_companies,
    ...((sourceFilter?.type === 'workbook' && sourceFilter.rowIndexAvailable) ? (sourceFilter.headers ?? []).map((header) => ({
      id: sourceColumnId(header), label: `Original: ${header}`, group: 'source' as const,
    })) : []),
  ], [sourceFilter]);
  const visibleColumns = useCrmColumns('crm_companies', columnOptions, sourceFilter?.id);
  const shows = (column: string) => visibleColumns.includes(column);
  const query = useCrmCompanies(workspace.id, { page, search, industry, sort, sourceImportId: sourceFilter?.id });
  const rows = query.data?.rows ?? [];
  const sourceHeaders = visibleColumns.map(sourceHeaderFromColumnId).filter((value): value is string => Boolean(value));
  const sourceRows = useCrmSourceRows(workspace.id, sourceFilter?.id ?? null, rows.flatMap((row) => row.source_row_number ?? []), sourceHeaders);
  const industries = useCrmIndustryOptions(workspace.id);
  const mutations = useCrmCompanyMutations(workspace.id);
  const enrichment = useCrmCompanyEnrichment(workspace.id);
  const closeEditor = () => { setEditing(undefined); mutations.create.reset(); mutations.update.reset(); };
  const save = (input: CrmCompanyInput) => {
    const onSuccess = closeEditor;
    if (editing) mutations.update.mutate({ id: editing.id, input }, { onSuccess });
    else {
      const field_sources = Object.fromEntries(Object.entries(input)
        .filter(([field, value]) => field !== 'field_sources' && String(value ?? '').trim())
        .map(([field]) => [field, 'user'])) as CompanyFieldSources;
      mutations.create.mutate({ ...input, field_sources }, { onSuccess });
    }
  };
  const remove = (row: CrmCompany) => {
    if (window.confirm(`Delete ${row.name}? Related contacts and deals will keep their records without this company.`)) {
      mutations.remove.mutate(row.id, { onSuccess: () => setPage((current) => pageAfterDelete(current, rows.length)) });
    }
  };
  return (
    <div className="space-y-5">
      <CrmPageHeader eyebrow="Account ledger" title="Companies" description="The durable account directory for contacts, deals, and future import lineage." action={<button type="button" className="btn-primary" onClick={() => setEditing(null)}>Add company</button>} />
      <CrmFilterBar search={search} placeholder="Search companies" onSearchChange={(value) => { setSearch(value); setPage(1); }}>
        <CrmColumnPicker table="crm_companies" options={columnOptions} sourceId={sourceFilter?.id} />
        <button type="button" className="btn-secondary" disabled={enrichment.isPending || rows.length === 0} onClick={() => enrichment.mutate(normalizeCompanyIds(rows.map((row) => row.id)))}>{enrichment.isPending ? 'Enriching…' : `Enrich visible (${rows.length})`}</button>
        <label><span className="sr-only">Industry</span><select className="input min-w-40" value={industry} onChange={(event) => { setIndustry(event.target.value); setPage(1); }}><option value="">All industries</option>{(industries.data ?? []).map((value) => <option key={value}>{value}</option>)}</select></label>
        <label><span className="sr-only">Sort companies</span><select className="input min-w-36" value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}><option value="name_asc">Name A–Z</option><option value="name_desc">Name Z–A</option><option value="recent">Newest</option></select></label>
      </CrmFilterBar>
      {sourceFilter && <div className="flex items-center justify-between gap-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900" role="status"><span>Showing records from <strong>{sourceFilter.filename}</strong> ({sourceFilter.databaseId})</span><button type="button" className="font-semibold underline" onClick={() => { setSourceFilter(clearSourceFilter(sourceFilter)); setPage(1); }}>Clear filter</button></div>}
      {(mutations.remove.error || industries.error || enrichment.error) && <ErrorState error={mutations.remove.error ?? industries.error ?? enrichment.error} />}
      {enrichment.data && <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm" role="status">Enrichment checked {enrichment.data.results.length + enrichment.data.errors.length} companies; {enrichment.data.results.reduce((total, result) => total + result.updated_fields.length, 0)} blank fields filled{enrichment.data.errors.length ? `, ${enrichment.data.errors.length} failed` : ''}.{enrichment.data.warnings?.length ? ` ${enrichment.data.warnings.join(' ')}` : ''}</div>}
      <CrmResourceState loading={query.isLoading} error={query.error} empty={rows.length === 0}>
        <div className="crm-table-wrap">
          <table className="crm-table"><thead><tr>{shows('name') && <th>Company</th>}{shows('industry') && <th>Industry</th>}{shows('location') && <th>Location</th>}{shows('phone') && <th>Phone</th>}{shows('website') && <th>Website</th>}{shows('domain') && <th>Domain</th>}{shows('address_line_1') && <th>Address line 1</th>}{shows('address_line_2') && <th>Address line 2</th>}{shows('city') && <th>City</th>}{shows('state_region') && <th>State / region</th>}{shows('postal_code') && <th>Postal code</th>}{shows('country') && <th>Country</th>}{shows('created_at') && <th>Created</th>}{shows('updated_at') && <th>Updated</th>}{shows('source') && <th>Source</th>}{shows('contact_count') && <th>Contacts</th>}{shows('deal_count') && <th>Deals</th>}{shows('task_count') && <th>Tasks</th>}{sourceHeaders.map((header) => <th key={header}>{header}</th>)}<th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{rows.map((row) => <tr key={row.id}>{shows('name') && <td data-label="Company"><Link className="crm-record-link font-semibold" to={crmRecordPath(workspace.id, 'company', row.id)}>{row.name}</Link></td>}{shows('industry') && <td data-label="Industry"><span>{displayText(row.industry)}</span>{row.industry && <small className="crm-field-source">{fieldSourceLabel(row.field_sources?.industry)}</small>}</td>}{shows('location') && <td data-label="Location">{displayText([row.city, row.country].filter(Boolean).join(', '))}</td>}{shows('phone') && <td data-label="Phone">{displayText(row.phone)}</td>}{shows('website') && <td data-label="Website">{displayText(row.website)}</td>}{shows('domain') && <td data-label="Domain">{displayText(row.domain)}</td>}{shows('address_line_1') && <td data-label="Address line 1">{displayText(row.address_line_1)}</td>}{shows('address_line_2') && <td data-label="Address line 2">{displayText(row.address_line_2)}</td>}{shows('city') && <td data-label="City">{displayText(row.city)}</td>}{shows('state_region') && <td data-label="State / region">{displayText(row.state_region)}</td>}{shows('postal_code') && <td data-label="Postal code">{displayText(row.postal_code)}</td>}{shows('country') && <td data-label="Country">{displayText(row.country)}</td>}{shows('created_at') && <td data-label="Created">{formatCrmDate(row.created_at)}</td>}{shows('updated_at') && <td data-label="Updated">{formatCrmDate(row.updated_at)}</td>}{shows('source') && <td data-label="Source"><CrmSourceBadge source={row.primary_source} count={row.source_count} onSelect={(source) => { setSourceFilter(source); setPage(1); }} /></td>}{shows('contact_count') && <td data-label="Contacts">{row.contact_count ?? '—'}</td>}{shows('deal_count') && <td data-label="Deals">{row.deal_count ?? '—'}</td>}{shows('task_count') && <td data-label="Tasks">{row.task_count ?? '—'}</td>}{sourceHeaders.map((header) => <td data-label={header} key={header}>{displayText(sourceRows.data?.get(row.source_row_number ?? -1)?.[header])}</td>)}<td data-label="Actions"><CrmRowActions onEdit={() => setEditing(row)} onDelete={canDeleteCrmRecords(workspace.role) ? () => remove(row) : undefined} /></td></tr>)}</tbody>
          </table>
        </div>
      </CrmResourceState>
      <CrmPagination page={page} pageSize={PAGE_SIZE} count={query.data?.count ?? 0} onPageChange={setPage} />
      <Modal open={editing !== undefined} onClose={closeEditor} title={editing ? 'Edit company' : 'Add company'} wide><CompanyEditor initial={editing} busy={mutations.create.isPending || mutations.update.isPending} error={mutations.create.error ?? mutations.update.error} onCancel={closeEditor} onSave={save} /></Modal>
    </div>
  );
}
