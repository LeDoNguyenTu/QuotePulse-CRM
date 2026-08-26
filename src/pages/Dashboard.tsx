import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation, useSearchParams } from 'react-router-dom';
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
import { HubspotObjectsPanel } from '../components/HubspotObjectsPanel';
import { BulkSendPanel } from '../components/BulkSendPanel';
import { Modal } from '../components/Modal';
import { ErrorState, Spinner } from '../components/ui';
import { exportXlsx, functions } from '../lib/functions';
import type { ExportScope } from '../lib/exportScope';
import { ExportScopeModal } from '../components/ExportScopeModal';
import { cleanDealName } from '../lib/dealName';
import type { SourcePriority } from '../lib/types';
import { useSettings, useSaveSettings } from '../hooks/useSettings';
import { useHubspotPropertyCatalog, useHubspotPropertyCoverage } from '../hooks/useHubspotPropertyCatalog';
import { DEFAULT_VISIBLE_COLUMNS, resolveVisibleColumns, saveVisibleColumns, type ConfigurableTable } from '../lib/tablePreferences';
import { useHubspotImport, type LiveImport } from '../hooks/useHubspotImport';
import { splitPropertiesByCoverage } from '../lib/propertyCoverage';
import { importCompletionPercent, shouldShowImportReport } from '../lib/importReport';
import { shouldShowLiveImport } from '../lib/importSession';
import {
  importActivityText,
  liveImportPercent,
  importResponseTimestamp,
  recentImportEtaMinutes,
} from '../lib/importProgress';
import { clampPage, readDashboardState, writeDashboardState, type ObjectListState } from '../lib/dashboardState';
import { consumeScrollPosition, routePath } from '../lib/returnNavigation';
import { StorageStatusPanel } from '../components/StorageStatusPanel';
import { ImportRecoveryWarning } from '../components/ImportRecoveryWarning';
import { useStorageStatus } from '../hooks/useStorageStatus';
import { importRecoveryLock, shouldStopImportForRecovery } from '../lib/storageStatus';

const PAGE_SIZE = 25;
const MAX_REBUILD_STEPS = 200;

export function Dashboard() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const dashboardState = useMemo(() => readDashboardState(searchParams), [searchParams]);
  const activeTable = dashboardState.view;
  const filters = dashboardState.companies;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [rebuilding, setRebuilding] = useState(false);

  const qc = useQueryClient();
  const { state: importState, startImport, stopImport, dismissImportReport } = useHubspotImport();
  const importing = importState?.status === 'running';
  const storageStatus = useStorageStatus();
  const importLock = importRecoveryLock(storageStatus.data, {
    loading: storageStatus.isLoading,
    failed: !!storageStatus.error,
  });
  const importReport = importState?.report ?? null;
  const live = shouldShowLiveImport(importState?.status, !!importState?.live)
    ? importState?.live ?? null
    : null;
  const settings = useSettings();
  const saveSettings = useSaveSettings();
  const companyCatalog = useHubspotPropertyCatalog('companies');
  const companyCoverage = useHubspotPropertyCoverage('companies');
  const visibleColumns = resolveVisibleColumns('companies', settings.data?.table_column_preferences);
  const companyFields = splitPropertiesByCoverage(companyCatalog.data ?? [], companyCoverage.data ?? []);
  const customColumns = [...companyFields.available, ...companyFields.hidden].filter((field) =>
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
    if (shouldStopImportForRecovery(importing, !!importState?.stopRequested, importLock.locked)) {
      stopImport();
    }
  }, [importLock.locked, importing, importState?.stopRequested, stopImport]);

  function setDashboardState(next: typeof dashboardState) {
    setSearchParams(writeDashboardState(next), { replace: true });
  }

  function setActiveTable(view: ConfigurableTable) {
    setDashboardState({ ...dashboardState, view });
  }

  useEffect(() => {
    const nextPage = clampPage(page, countQuery.data, pageSize);
    if (nextPage !== page) {
      setDashboardState({
        ...dashboardState,
        companies: { ...filters, page: nextPage },
      });
    }
  }, [countQuery.data, page, pageCount, pageSize]);

  useEffect(() => {
    const currentRoute = routePath(location);
    const scrollY = consumeScrollPosition(window.sessionStorage, currentRoute);
    if (scrollY == null) return;
    let frame = 0;
    let attempts = 0;
    const restore = () => {
      window.scrollTo({ top: scrollY, behavior: 'auto' });
      attempts += 1;
      if (attempts < 20 && Math.abs(window.scrollY - scrollY) > 2) {
        frame = window.requestAnimationFrame(restore);
      }
    };
    frame = window.requestAnimationFrame(restore);
    return () => window.cancelAnimationFrame(frame);
  }, [location.key]);

  const selectedRows = useMemo(
    () => rows.filter((r) => selected.has(r.id)),
    [rows, selected]
  );

  function patch(next: Partial<CompanyFilters>) {
    setDashboardState({ ...dashboardState, companies: { ...filters, ...next } });
  }

  function patchObject(objectType: 'deals' | 'contacts', next: Partial<ObjectListState>) {
    setDashboardState({
      ...dashboardState,
      [objectType]: { ...dashboardState[objectType], ...next },
    });
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

  async function handleExport(scope: ExportScope) {
    setExporting(true);
    try {
      const blob = await exportXlsx(scope);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `companies-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setExportOpen(false);
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
    if (importLock.locked) {
      setBanner(importLock.message);
      return;
    }
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
      for (let step = 0; step < MAX_REBUILD_STEPS; step++) {
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
        <h1 className="text-2xl font-semibold">HubSpot CRM</h1>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn-secondary"
            onClick={handleImportAll}
            disabled={importing || importLock.locked}
            title={importLock.locked ? importLock.message : undefined}
          >
            {importing
              ? 'Importing…'
              : importLock.locked
                ? 'HubSpot import temporarily disabled'
                : 'Sync HubSpot (new + changed + missing fields)'}
          </button>
          {activeTable === 'companies' && <>
          <button className="btn-secondary" onClick={() => setNewOpen(true)}>
            + New company
          </button>
          <button
            className="btn-secondary"
            onClick={handleRebuild}
            disabled={rebuilding || importing}
            title="Deal names are 'PRODUCT - CUSTOMER'. Re-file every deal under the customer."
          >
            {rebuilding ? 'Re-linking…' : 'Fix company names'}
          </button>
          <button className="btn-secondary" onClick={() => setExportOpen(true)} disabled={exporting}>
            {exporting ? 'Exporting…' : 'Export'}
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
          </>}
        </div>
      </div>

      <ImportRecoveryWarning
        lock={importLock}
        onRefresh={storageStatus.refetch}
      />

      <StorageStatusPanel />

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

      {shouldShowImportReport(importState?.status, !!importReport) && importReport && (
        <ImportReport report={importReport} onDismiss={dismissImportReport} />
      )}

      <div className="flex gap-1 border-b border-slate-200" role="tablist" aria-label="HubSpot object type">
        {(['companies', 'deals', 'contacts'] as ConfigurableTable[]).map((table) => (
          <button
            key={table}
            role="tab"
            aria-selected={activeTable === table}
            className={`border-b-2 px-4 py-2 text-sm font-medium capitalize ${
              activeTable === table
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
            onClick={() => setActiveTable(table)}
          >
            {table}
          </button>
        ))}
      </div>

      {activeTable === 'companies' ? <>
      <div className="flex flex-wrap items-center gap-3">
        <SearchBar value={filters.search ?? ''} onChange={(v) => patch({ search: v, page: 0 })} />
        <Filters filters={filters} onChange={patch} />
        <div className="order-1">
          <ColumnSelector
            options={[
              ...DEFAULT_VISIBLE_COLUMNS.companies
                .map((id) => ({ id, label: id.replace(/_/g, ' ') })),
              ...companyFields.available
                .filter((field) => !DEFAULT_VISIBLE_COLUMNS.companies.includes(field.property_name))
                .map((field) => ({ id: field.property_name, label: field.label })),
              ...companyFields.hidden
                .filter((field) => !DEFAULT_VISIBLE_COLUMNS.companies.includes(field.property_name))
                .map((field) => ({ id: field.property_name, label: field.label, group: 'hidden' as const })),
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
          <CompaniesTable rows={rows} selected={selected} onToggle={toggle} onToggleAll={toggleAll} visibleColumns={visibleColumns} extraColumns={customColumns.map((field) => ({ id: field.property_name, label: field.label }))} />
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
      </> : <HubspotObjectsPanel
        objectType={activeTable}
        state={dashboardState[activeTable]}
        onChange={(next) => patchObject(activeTable, next)}
      />}

      <BulkSendPanel
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        companies={selectedRows}
      />
      <NewCompanyModal open={newOpen} onClose={() => setNewOpen(false)} />
      <ExportScopeModal open={exportOpen} onClose={() => setExportOpen(false)} onExport={handleExport} busy={exporting} />
    </div>
  );
}

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
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const { counts, progress, startedAt } = live;
  const total = progress?.deals_in_hubspot ?? null;
  const imported = progress?.deals_imported ?? null;
  const remaining = total != null && imported != null ? Math.max(0, total - imported) : null;
  const repairingProperties = progress?.phase === 'properties';

  // Normal catch-up stays below 100 until the backend confirms it. The property
  // phase is entered only after active deals are caught up, so it can truthfully
  // show core synchronization at 100 while historic field maintenance continues.
  const percent = liveImportPercent(total, imported, progress?.phase);

  const etaMin = recentImportEtaMinutes(
    remaining,
    live.recentDealsPerSec,
    progress?.phase
  );
  const lastResponseAt = importResponseTimestamp(live.lastStepAt, startedAt);
  const secondsSinceResponse = Math.max(0, (now - lastResponseAt) / 1_000);
  const activityText = importActivityText(secondsSinceResponse);

  return (
    <div className="space-y-2 rounded-md border border-brand-200 bg-brand-50 p-3 text-sm text-brand-900">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">
          {repairingProperties
            ? 'Core deal sync complete — 100%'
            : percent != null ? `Importing from HubSpot — ${percent}%` : 'Importing from HubSpot…'}
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

      <div
        className="flex items-center gap-2 text-xs text-brand-700"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <span
          className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-brand-200 border-t-brand-700"
          aria-hidden="true"
        />
        <span>{activityText}</span>
      </div>

      <p className="text-xs">
        {repairingProperties ? (
          <>
            Normal sync is caught up. Full readable properties are being added to historic deals;
            new and modified deals remain prioritized, and this maintenance cursor resumes automatically.
          </>
        ) : total != null && imported != null ? (
          <>
            <b>{imported.toLocaleString()}</b> of <b>{total.toLocaleString()}</b> deals imported ·{' '}
            <b>{remaining?.toLocaleString()}</b> remaining ·{' '}
            {progress?.companies == null
              ? 'company count temporarily unavailable'
              : `${progress.companies.toLocaleString()} companies`}
            {etaMin != null && ` · about ${etaMin} min left`}
          </>
        ) : total != null ? (
          <>
            <b>{total.toLocaleString()}</b> deals in HubSpot · local count temporarily unavailable
          </>
        ) : (
          'Starting…'
        )}
      </p>

      <p className="text-xs text-brand-700">
        This run: +{counts.deals.toLocaleString()} deals, +{counts.companies.toLocaleString()}{' '}
        companies, +{counts.contacts.toLocaleString()} contacts, +
        {counts.attachments.toLocaleString()} attachments, +
        {counts.properties_backfilled.toLocaleString()} historic property snapshots
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
  const completionPercent = importCompletionPercent(done);
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
            ? `HubSpot import ${done ? 'complete' : 'paused'}: ${counts.companies} companies, ${counts.deals} deals, ${counts.contacts} contacts, ${counts.attachments} attachments, ${counts.properties_backfilled} historic property snapshots repaired.`
            : 'HubSpot import failed — nothing was imported.'}
        </p>
        <button className="text-xs underline" onClick={onDismiss}>
          Dismiss
        </button>
      </div>

      {completionPercent != null && (
        <p className="text-xs font-medium">Sync progress: {completionPercent}%</p>
      )}

      {counts.skipped_existing > 0 && (
        <p className="text-xs">
          {counts.skipped_existing.toLocaleString()} deal
          {counts.skipped_existing === 1 ? ' was' : 's were'} already up to date and left
          untouched — only new and changed deals are pulled.
        </p>
      )}

      {counts.properties_backfilled > 0 && (
        <p className="text-xs">
          Repaired the full readable HubSpot field snapshot for{' '}
          {counts.properties_backfilled.toLocaleString()} historic deal
          {counts.properties_backfilled === 1 ? '' : 's'} without replaying notes or files.
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
