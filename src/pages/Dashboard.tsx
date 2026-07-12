import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useCompanies,
  useCreateCompany,
  useSoftDeleteCompanies,
  type CompanyFilters,
} from '../hooks/useCompanies';
import type { IngestResult } from '../lib/functions';
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
  const [importReport, setImportReport] = useState<IngestResult | null>(null);

  const qc = useQueryClient();
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
    setImportReport(null);

    // The Edge Function is bounded by a wall-time budget and resumes from a
    // persisted cursor, so drive it until it reports done (same pattern as the
    // email queue worker).
    const total: IngestResult = {
      ok: true,
      counts: { companies: 0, deals: 0, contacts: 0, attachments: 0, skipped_trashed: 0 },
      errors: [],
      warnings: [],
      done: false,
    };

    try {
      for (let i = 0; i < 20; i++) {
        const res = await functions.hubspotIngest();
        total.ok = res.ok;
        // An older deployment of the function doesn't return `done` at all —
        // treat a missing value as finished rather than re-invoking 20 times.
        const done = res.done ?? true;
        total.done = done;
        for (const k of Object.keys(total.counts) as (keyof IngestResult['counts'])[]) {
          total.counts[k] += res.counts?.[k] ?? 0;
        }
        for (const w of res.warnings ?? []) if (!total.warnings.includes(w)) total.warnings.push(w);
        total.errors.push(...(res.errors ?? []));
        if (done) break;
      }
      setImportReport(total);
      qc.invalidateQueries({ queryKey: ['companies'] });
    } catch (e) {
      // A thrown error means the function returned non-2xx — i.e. a real failure
      // (bad HubSpot credential, missing deals scope). Show it verbatim.
      setImportReport({
        ...total,
        ok: false,
        errors: [...total.errors, e instanceof Error ? e.message : String(e)],
      });
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

      {importReport && (
        <ImportReport report={importReport} onDismiss={() => setImportReport(null)} />
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

/**
 * Shows what the import actually did — including the raw HubSpot error text.
 * The previous version printed only a count of "warnings", so a total auth
 * failure looked like a successful import of zero companies.
 */
function ImportReport({
  report,
  onDismiss,
}: {
  report: IngestResult;
  onDismiss: () => void;
}) {
  const { ok, counts, errors, warnings, done } = report;
  const tone = !ok
    ? 'border-red-200 bg-red-50 text-red-900'
    : errors.length || warnings.length
      ? 'border-amber-200 bg-amber-50 text-amber-900'
      : 'border-emerald-200 bg-emerald-50 text-emerald-900';

  return (
    <div className={`space-y-2 rounded-md border p-3 text-sm ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium">
          {ok
            ? `HubSpot import ${done ? 'complete' : 'paused'}: ${counts.companies} companies, ${counts.deals} deals, ${counts.contacts} contacts, ${counts.attachments} attachments.`
            : 'HubSpot import failed — nothing was imported.'}
        </p>
        <button className="text-xs underline" onClick={onDismiss}>
          Dismiss
        </button>
      </div>

      {counts.skipped_trashed > 0 && (
        <p className="text-xs">
          {counts.skipped_trashed} compan{counts.skipped_trashed === 1 ? 'y is' : 'ies are'} in
          your recycle bin and were skipped. Restore them to import their data again.
        </p>
      )}

      {warnings.length > 0 && (
        <ul className="list-inside list-disc space-y-0.5 text-xs">
          {warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}

      {errors.length > 0 && (
        <details open={!ok}>
          <summary className="cursor-pointer text-xs font-medium">
            {errors.length} error{errors.length === 1 ? '' : 's'} from HubSpot
          </summary>
          <ul className="mt-1 space-y-1">
            {errors.slice(0, 10).map((e, i) => (
              <li key={i} className="break-all rounded bg-white/60 p-1.5 font-mono text-xs">
                {e}
              </li>
            ))}
          </ul>
          {errors.length > 10 && (
            <p className="mt-1 text-xs">…and {errors.length - 10} more.</p>
          )}
        </details>
      )}
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
