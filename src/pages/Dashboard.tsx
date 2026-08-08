import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useCompanies,
  useCreateCompany,
  useSoftDeleteCompanies,
  type CompanyFilters,
} from '../hooks/useCompanies';
import type { IngestResult, RebuildResult } from '../lib/functions';
import { SearchBar } from '../components/SearchBar';
import { Filters } from '../components/Filters';
import { CompaniesTable } from '../components/CompaniesTable';
import { ColumnSelector } from '../components/ColumnSelector';
import { BulkSendPanel } from '../components/BulkSendPanel';
import { Modal } from '../components/Modal';
import { ErrorState, Spinner } from '../components/ui';
import { exportXlsx, functions } from '../lib/functions';
import { cleanDealName } from '../lib/dealName';
import type { SourcePriority } from '../lib/types';
import { useSettings, useSaveSettings } from '../hooks/useSettings';
import { useHubspotPropertyCatalog, useHubspotPropertyCoverage } from '../hooks/useHubspotPropertyCatalog';
import { DEFAULT_VISIBLE_COLUMNS, resolveVisibleColumns, saveVisibleColumns } from '../lib/tablePreferences';
import { useHubspotImport, type LiveImport } from '../hooks/useHubspotImport';
import { fieldsWithImportedValues } from '../lib/propertyCoverage';

const PAGE_SIZE = 25;

export function Dashboard() {
  const [filters, setFilters] = useState<CompanyFilters>({ page: 0, pageSize: PAGE_SIZE });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [rebuilding, setRebuilding] = useState(false);

  const qc = useQueryClient();
  const { state: importState, startImport, stopImport, dismissImportReport } = useHubspotImport();
  const importing = importState?.status === 'running';
  const importReport = importState?.report ?? null;
  const live = importState?.live ?? null;
  const settings = useSettings();
  const saveSettings = useSaveSettings();
  const companyCatalog = useHubspotPropertyCatalog('companies');
  const companyCoverage = useHubspotPropertyCoverage('companies');
  const visibleColumns = resolveVisibleColumns('companies', settings.data?.table_column_preferences);
  const companyFields = fieldsWithImportedValues(companyCatalog.data ?? [], companyCoverage.data ?? []);
  const customColumns = companyFields.filter((field) =>
    visibleColumns.includes(field.property_name) && !DEFAULT_VISIBLE_COLUMNS.companies.includes(field.property_name)
  );
  const softDelete = useSoftDeleteCompanies();
  const { data, isLoading, isFetching, isPlaceholderData, pageQuery, countQuery } = useCompanies(filters);
  const rows = data?.rows ?? [];
  const total = data?.count ?? 0;
  const page = filters.page ?? 0;
  const pageSize = filters.pageSize ?? PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (countQuery.data != null && page >= pageCount) setFilters((f) => ({ ...f, page: pageCount - 1 }));
  }, [countQuery.data, page, pageCount]);

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
        activity_from: filters.activity_from,
        activity_to: filters.activity_to,
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
    setBanner(null);
    await startImport();
    /*
    setBanner(null);
    await startImport();
    return;

    setImporting(true);
    setBanner(null);
    setImportReport(null);
    cancelRef.current = false;

    // Each invocation of the Edge Function is one ~30s slice of work; it persists
    // its cursor and reports how far along it is, so we drive it in a loop and
    // repaint the progress bar after every slice.
    const total: IngestResult = {
      ok: true,
      counts: {
        companies: 0,
        deals: 0,
        contacts: 0,
        attachments: 0,
        skipped_trashed: 0,
        skipped_existing: 0,
      },
      errors: [],
      warnings: [],
      done: false,
    };
    const startedAt = Date.now();
    setLive({ counts: { ...total.counts }, progress: null, startedAt, step: 0 });

    try {
      for (let step = 1; step <= MAX_IMPORT_STEPS; step++) {
        const res = await functions.hubspotIngest();
        total.ok = res.ok;
        // An older deployment of the function doesn't return `done` at all —
        // treat a missing value as finished rather than re-invoking forever.
        const done = res.done ?? true;
        total.done = done;
        for (const k of Object.keys(total.counts) as (keyof IngestResult['counts'])[]) {
          total.counts[k] += res.counts?.[k] ?? 0;
        }
        for (const w of res.warnings ?? []) if (!total.warnings.includes(w)) total.warnings.push(w);
        total.errors.push(...(res.errors ?? []));
        total.progress = res.progress ?? total.progress;

        setLive({
          counts: { ...total.counts },
          progress: res.progress ?? null,
          startedAt,
          step,
        });
        qc.invalidateQueries({ queryKey: ['account'] });

        if (done) break;
        if (cancelRef.current) {
          total.warnings.push(
            'Stopped early. Everything imported so far is saved — run the import again to pick up where it left off.'
          );
          break;
        }
      }
      setImportReport(total);
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
      setLive(null);
      qc.invalidateQueries({ queryKey: ['account'] });
    }
  }

  */
  }

  async function handleRebuild() {
    if (
      !window.confirm(
        'Re-link every deal to the customer named in it?\n\n' +
          'Deal names look like "ADOBE (REN) - THE PR PEOPLE PTE LTD". The customer is ' +
          'THE PR PEOPLE — Adobe is the product. Deals were previously filed under the ' +
          'product, so companies like "Adobe" and "Dell" appear in your list holding ' +
          'hundreds of unrelated customers.\n\n' +
          'This rebuilds them from the deal names already imported. The leftover product ' +
          'rows go to the recycle bin, so nothing is destroyed.'
      )
    )
      return;

    setRebuilding(true);
    setBanner(null);
    let remapped = 0;
    let created = 0;
    let retired = 0;
    let industries = 0;
    const errors: string[] = [];

    try {
      // Same resumable pattern as the import: it works to a time budget and a
      // second run is a cheap no-op over the deals it already fixed.
      for (let step = 0; step < MAX_IMPORT_STEPS; step++) {
        const res: RebuildResult = await functions.hubspotRebuild();
        remapped += res.counts?.remapped ?? 0;
        created += res.counts?.created ?? 0;
        industries += res.counts?.industries ?? 0;
        retired = res.counts?.retired ?? retired;
        errors.push(...(res.errors ?? []));
        if (res.done ?? true) break;
      }
      setBanner(
        `Re-linked ${remapped.toLocaleString()} deals to their real customer · ` +
          `${created.toLocaleString()} companies created · ` +
          `${industries.toLocaleString()} industries identified · ` +
          `${retired.toLocaleString()} product rows moved to the recycle bin.` +
          (errors.length ? ` ${errors.length} problem(s): ${errors[0]}` : '')
      );
      qc.invalidateQueries({ queryKey: ['account'] });
    } catch (e) {
      setBanner(e instanceof Error ? e.message : String(e));
    } finally {
      setRebuilding(false);
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
          <button
            className="btn-secondary"
            onClick={handleRebuild}
            disabled={rebuilding || importing}
            title="Deal names are 'PRODUCT - CUSTOMER'. Re-file every deal under the customer."
          >
            {rebuilding ? 'Re-linking…' : 'Fix company names'}
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

      {live && (
        <ImportProgressPanel
          live={live}
          onStop={stopImport}
          stopping={!!importState?.stopRequested}
        />
      )}

      {importReport && (
        <ImportReport report={importReport} onDismiss={dismissImportReport} />
      )}

      <div className="flex flex-wrap items-center gap-3">
        <SearchBar value={filters.search ?? ''} onChange={(v) => patch({ search: v, page: 0 })} />
        <Filters filters={filters} onChange={patch} />
        <div className="order-1">
          <ColumnSelector
            options={[
              ...visibleColumns
                .filter((id) => DEFAULT_VISIBLE_COLUMNS.companies.includes(id))
                .map((id) => ({ id, label: id.replace(/_/g, ' ') })),
              ...companyFields.map((field) => ({ id: field.property_name, label: field.label })),
            ]}
            visible={visibleColumns}
            onChange={(columns) => saveSettings.mutate({ table_column_preferences: saveVisibleColumns(settings.data?.table_column_preferences, 'companies', columns) })}
            onRestore={() => saveSettings.mutate({ table_column_preferences: saveVisibleColumns(settings.data?.table_column_preferences, 'companies', null) })}
          />
        </div>
      </div>

      {pageQuery.error && <ErrorState error={pageQuery.error} />}
      {countQuery.error && <ErrorState error={countQuery.error} />}
      {isLoading ? (
        <Spinner label="Loading companies…" />
      ) : (
        <div className="relative">
          <CompaniesTable rows={rows} selected={selected} onToggle={toggle} onToggleAll={toggleAll} extraColumns={customColumns.map((field) => ({ id: field.property_name, label: field.label }))} />
          {isFetching && (
            <div className="absolute inset-0 grid place-items-center bg-white/65" aria-live="polite">
              <Spinner label={`Loading page ${page + 1}…`} />
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>
          {total} companies · page {page + 1} of {pageCount}
        </span>
        <div className="flex gap-2">
          <button
            className="btn-secondary"
            disabled={page <= 0 || isFetching}
            onClick={() => patch({ page: page - 1 })}
          >
            Prev
          </button>
          <button
            className="btn-secondary"
            disabled={page + 1 >= pageCount || isFetching}
            onClick={() => patch({ page: page + 1 })}
          >
            Next
          </button>
          {pageQuery.error && isPlaceholderData && (
            <button className="btn-secondary" onClick={() => pageQuery.refetch()}>
              Retry page {page + 1}
            </button>
          )}
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

/** Enough 30s slices to walk a very large portal; the user can stop at any point. */
const MAX_IMPORT_STEPS = 200;

/**
 * Live progress while the import loop runs. Without this the button just said
 * "Importing…" for several minutes with no sign of life or end.
 */
function ImportProgressPanel({
  live,
  onStop,
  stopping,
}: {
  live: LiveImport;
  onStop: () => void;
  stopping: boolean;
}) {
  const { counts, progress, startedAt } = live;
  const total = progress?.deals_in_hubspot ?? null;
  const imported = progress?.deals_imported ?? 0;
  const remaining = total != null ? Math.max(0, total - imported) : null;

  // Hold at 99% until the function actually reports done: HubSpot's total counts
  // only active deals, so archived ones can push the ratio past 1.
  const percent =
    total && total > 0 ? Math.min(99, Math.round((imported / total) * 100)) : null;

  const elapsedSec = Math.max(1, (Date.now() - startedAt) / 1000);
  const dealsPerSec = counts.deals / elapsedSec;
  const etaMin =
    remaining != null && dealsPerSec > 0.05 ? Math.ceil(remaining / dealsPerSec / 60) : null;

  return (
    <div className="space-y-2 rounded-md border border-brand-200 bg-brand-50 p-3 text-sm text-brand-900">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">
          {percent != null ? `Importing from HubSpot — ${percent}%` : 'Importing from HubSpot…'}
        </span>
        <button className="text-xs underline" onClick={onStop} disabled={stopping}>
          {stopping ? 'Stopping after this step…' : 'Stop'}
        </button>
      </div>

      <div
        className="h-2 w-full overflow-hidden rounded bg-brand-100"
        role="progressbar"
        aria-valuenow={percent ?? undefined}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`h-2 rounded bg-brand-600 transition-all duration-500 ${percent == null ? 'animate-pulse' : ''}`}
          style={{ width: `${percent ?? 100}%` }}
        />
      </div>

      <p className="text-xs">
        {total != null ? (
          <>
            <b>{imported.toLocaleString()}</b> of <b>{total.toLocaleString()}</b> deals imported ·{' '}
            <b>{remaining?.toLocaleString()}</b> remaining · {progress?.companies.toLocaleString()}{' '}
            companies
            {etaMin != null && ` · about ${etaMin} min left`}
          </>
        ) : (
          'Starting…'
        )}
      </p>

      <p className="text-xs text-brand-700">
        This run: +{counts.deals.toLocaleString()} deals, +{counts.companies.toLocaleString()}{' '}
        companies, +{counts.contacts.toLocaleString()} contacts, +
        {counts.attachments.toLocaleString()} attachments
        {progress?.phase === 'incremental' && ' · catching up on recent changes only'}
      </p>
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

      {counts.skipped_existing > 0 && (
        <p className="text-xs">
          {counts.skipped_existing.toLocaleString()} deal
          {counts.skipped_existing === 1 ? ' was' : 's were'} already up to date and left
          untouched — only new and changed deals are pulled.
        </p>
      )}

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
