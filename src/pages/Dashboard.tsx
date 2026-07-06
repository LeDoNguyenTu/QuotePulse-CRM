import { useMemo, useState } from 'react';
import {
  useCompanies,
  useCreateCompany,
  useSoftDeleteCompanies,
  type CompanyFilters,
} from '../hooks/useCompanies';
import { SearchBar } from '../components/SearchBar';
import { Filters } from '../components/Filters';
import { CompaniesTable } from '../components/CompaniesTable';
import { BulkSendPanel } from '../components/BulkSendPanel';
import { Modal } from '../components/Modal';
import { ErrorState, Spinner } from '../components/ui';
import { exportXlsx, functions } from '../lib/functions';
import { cleanDealName } from '../lib/dealName';
import type { SourcePriority } from '../lib/types';

const PAGE_SIZE = 25;

export function Dashboard() {
  const [filters, setFilters] = useState<CompanyFilters>({ page: 0, pageSize: PAGE_SIZE });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const softDelete = useSoftDeleteCompanies();
  const { data, isLoading, error } = useCompanies(filters);
  const rows = data?.rows ?? [];
  const total = data?.count ?? 0;
  const page = filters.page ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const selectedRows = useMemo(
    () => rows.filter((r) => selected.has(r.id)),
    [rows, selected]
  );

  function patch(next: Partial<CompanyFilters>) {
    setFilters((f) => ({ ...f, ...next }));
  }

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleAll(ids: string[], value: boolean) {
    setSelected((s) => {
      const next = new Set(s);
      ids.forEach((id) => (value ? next.add(id) : next.delete(id)));
      return next;
    });
  }

  async function handleExport() {
    setExporting(true);
    try {
      const blob = await exportXlsx({
        search: filters.search,
        industry: filters.industry,
        source_priority: filters.source_priority,
        has_quote: filters.has_quote,
        has_kyc: filters.has_kyc,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `companies-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setBanner(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  }

  async function handleDelete() {
    const n = selected.size;
    if (n === 0) return;
    if (
      !window.confirm(
        `Move ${n} ${n === 1 ? 'company' : 'companies'} to the recycle bin? ` +
          `You can restore them within ${30} days from the Recycle bin.`
      )
    )
      return;
    setBanner(null);
    try {
      await softDelete.mutateAsync([...selected]);
      setSelected(new Set());
      setBanner(`Moved ${n} ${n === 1 ? 'company' : 'companies'} to the recycle bin.`);
    } catch (e) {
      setBanner(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleImportAll() {
    setImporting(true);
    setBanner(null);
    try {
      const res = await functions.hubspotIngest();
      setBanner(
        `HubSpot import complete: ${res.counts.companies} companies, ${res.counts.deals} deals, ${res.counts.contacts} contacts, ${res.counts.attachments} attachments.` +
          (res.errors.length ? ` (${res.errors.length} warnings)` : '')
      );
    } catch (e) {
      setBanner(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Companies</h1>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => setNewOpen(true)}>
            + New company
          </button>
          <button className="btn-secondary" onClick={handleImportAll} disabled={importing}>
            {importing ? 'Importing…' : 'Run HubSpot import'}
          </button>
          <button className="btn-secondary" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exporting…' : 'Export current view'}
          </button>
          <button
            className="btn-secondary text-red-600 disabled:text-slate-400"
            onClick={handleDelete}
            disabled={selected.size === 0 || softDelete.isPending}
          >
            {softDelete.isPending ? 'Deleting…' : `Delete (${selected.size})`}
          </button>
          <button
            className="btn-primary"
            onClick={() => setBulkOpen(true)}
            disabled={selected.size === 0}
          >
            Bulk send ({selected.size})
          </button>
        </div>
      </div>

      {banner && (
        <div className="rounded-md border border-brand-200 bg-brand-50 p-3 text-sm text-brand-800">
          {banner}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <SearchBar value={filters.search ?? ''} onChange={(v) => patch({ search: v, page: 0 })} />
        <Filters filters={filters} onChange={patch} />
      </div>

      {error && <ErrorState error={error} />}
      {isLoading ? (
        <Spinner label="Loading companies…" />
      ) : (
        <CompaniesTable
          rows={rows}
          selected={selected}
          onToggle={toggle}
          onToggleAll={toggleAll}
        />
      )}

      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>
          {total} companies · page {page + 1} of {pageCount}
        </span>
        <div className="flex gap-2">
          <button
            className="btn-secondary"
            disabled={page <= 0}
            onClick={() => patch({ page: page - 1 })}
          >
            Prev
          </button>
          <button
            className="btn-secondary"
            disabled={page + 1 >= pageCount}
            onClick={() => patch({ page: page + 1 })}
          >
            Next
          </button>
        </div>
      </div>

      <BulkSendPanel
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        companies={selectedRows}
      />
      <NewCompanyModal open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  );
}

function NewCompanyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createCompany = useCreateCompany();
  const [raw, setRaw] = useState('');
  const [industry, setIndustry] = useState('');
  const [website, setWebsite] = useState('');
  const [priority, setPriority] = useState<SourcePriority>('current');
  const [error, setError] = useState<string | null>(null);

  const clean = cleanDealName(raw);

  async function save() {
    setError(null);
    try {
      await createCompany.mutateAsync({
        name_raw: raw,
        name_clean: clean || raw,
        industry: industry || null,
        website: website || null,
        source_priority: priority,
      });
      setRaw('');
      setIndustry('');
      setWebsite('');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New company">
      <div className="space-y-3">
        <div>
          <label className="label">Raw name (as in HubSpot deal)</label>
          <input className="input" value={raw} onChange={(e) => setRaw(e.target.value)} />
          {raw && (
            <p className="mt-1 text-xs text-slate-500">
              Cleaned → <b>{clean || '(empty)'}</b>
            </p>
          )}
        </div>
        <div>
          <label className="label">Industry</label>
          <input
            className="input"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Website</label>
          <input
            className="input"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Source priority</label>
          <select
            className="input"
            value={priority}
            onChange={(e) => setPriority(e.target.value as SourcePriority)}
          >
            <option value="current">Current</option>
            <option value="recycled">Recycled</option>
            <option value="deleted">Deleted</option>
          </select>
        </div>
        {error && <ErrorState error={error} />}
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={save}
            disabled={!raw || createCompany.isPending}
          >
            {createCompany.isPending ? 'Saving…' : 'Create'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
