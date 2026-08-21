import { useEffect, useMemo, useRef, useState } from 'react';
import {
  TRASH_TTL_DAYS,
  useHardDeleteCompanies,
  usePurgeExpiredTrash,
  useRestoreCompanies,
  useTrashedCompanies,
} from '../hooks/useCompanies';
import { EmptyState, ErrorState, Spinner } from '../components/ui';
import { HistoryBackLink } from '../components/HistoryBackLink';

function daysLeft(deletedAt: string | null): number {
  if (!deletedAt) return TRASH_TTL_DAYS;
  const elapsedDays = (Date.now() - new Date(deletedAt).getTime()) / 86_400_000;
  return Math.max(0, Math.ceil(TRASH_TTL_DAYS - elapsedDays));
}

export function Trash() {
  const { data, isLoading, error } = useTrashedCompanies();
  const restore = useRestoreCompanies();
  const hardDelete = useHardDeleteCompanies();
  const purge = usePurgeExpiredTrash();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [banner, setBanner] = useState<string | null>(null);
  const purged = useRef(false);

  // Fallback for when pg_cron isn't enabled: clear expired items on open.
  useEffect(() => {
    if (purged.current) return;
    purged.current = true;
    purge.mutate();
  }, [purge]);

  const rows = data ?? [];
  const selectedIds = useMemo(() => [...selected], [selected]);
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleAll(value: boolean) {
    setSelected(value ? new Set(rows.map((r) => r.id)) : new Set());
  }

  async function doRestore(ids: string[]) {
    if (ids.length === 0) return;
    setBanner(null);
    try {
      await restore.mutateAsync(ids);
      setSelected(new Set());
      setBanner(`Restored ${ids.length} ${ids.length === 1 ? 'company' : 'companies'}.`);
    } catch (e) {
      setBanner(e instanceof Error ? e.message : String(e));
    }
  }

  async function doDelete(ids: string[], emptyAll = false) {
    if (ids.length === 0) return;
    const msg = emptyAll
      ? `Permanently delete ALL ${ids.length} companies in the recycle bin? This cannot be undone.`
      : `Permanently delete ${ids.length} ${ids.length === 1 ? 'company' : 'companies'}? This cannot be undone.`;
    if (!window.confirm(msg)) return;
    setBanner(null);
    try {
      await hardDelete.mutateAsync(ids);
      setSelected(new Set());
      setBanner(`Permanently deleted ${ids.length}.`);
    } catch (e) {
      setBanner(e instanceof Error ? e.message : String(e));
    }
  }

  const busy = restore.isPending || hardDelete.isPending;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Recycle bin</h1>
          <p className="mt-1 text-sm text-slate-500">
            Deleted companies are kept for {TRASH_TTL_DAYS} days, then permanently
            removed to save space. Restore anything before then.
          </p>
        </div>
        <HistoryBackLink fallback="/">← Back to previous view</HistoryBackLink>
      </div>

      {banner && (
        <div className="rounded-md border border-brand-200 bg-brand-50 p-3 text-sm text-brand-800">
          {banner}
        </div>
      )}
      {error && <ErrorState error={error} />}

      {isLoading ? (
        <Spinner label="Loading recycle bin…" />
      ) : rows.length === 0 ? (
        <EmptyState>The recycle bin is empty.</EmptyState>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn-secondary"
              disabled={busy || selected.size === 0}
              onClick={() => doRestore(selectedIds)}
            >
              Restore selected ({selected.size})
            </button>
            <button
              className="btn-secondary text-red-600 disabled:text-slate-400"
              disabled={busy || selected.size === 0}
              onClick={() => doDelete(selectedIds)}
            >
              Delete forever ({selected.size})
            </button>
            <button
              className="btn-secondary ml-auto"
              disabled={busy}
              onClick={() => doRestore(rows.map((r) => r.id))}
            >
              Restore all
            </button>
            <button
              className="btn-secondary text-red-600 disabled:text-slate-400"
              disabled={busy}
              onClick={() => doDelete(rows.map((r) => r.id), true)}
            >
              Empty recycle bin
            </button>
          </div>

          <div className="card overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(e) => toggleAll(e.target.checked)}
                    />
                  </th>
                  <th className="px-3 py-2">Company</th>
                  <th className="px-3 py-2">Industry</th>
                  <th className="px-3 py-2">Deleted</th>
                  <th className="px-3 py-2">Purges in</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const left = daysLeft(r.deleted_at);
                  return (
                    <tr key={r.id} className="border-b border-slate-100">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selected.has(r.id)}
                          onChange={() => toggle(r.id)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-800">{r.name_clean}</div>
                        {r.name_raw && r.name_raw !== r.name_clean && (
                          <div className="text-xs text-slate-400">{r.name_raw}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{r.industry ?? '—'}</td>
                      <td className="px-3 py-2 text-slate-500">
                        {r.deleted_at ? new Date(r.deleted_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-medium ${
                            left <= 3
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {left} {left === 1 ? 'day' : 'days'}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-3">
                          <button
                            className="text-brand-600 hover:underline disabled:opacity-50"
                            disabled={busy}
                            onClick={() => doRestore([r.id])}
                          >
                            Restore
                          </button>
                          <button
                            className="text-red-600 hover:underline disabled:opacity-50"
                            disabled={busy}
                            onClick={() => doDelete([r.id])}
                          >
                            Delete forever
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
