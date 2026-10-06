import { useActiveWorkspace } from '../hooks/useWorkspaces';
import { useWorkspaceArchive } from '../hooks/useWorkspaceArchive';
import { ErrorState } from './ui';

export function LegacyWorkspaceArchivePanel() {
  const workspace = useActiveWorkspace();
  const api = useWorkspaceArchive(workspace.id);
  const archive = api.latest.data;
  const progress = api.progress.data ?? [];
  const finalRows = Object.values(archive?.table_counts ?? {}).reduce((sum, count) => sum + Number(count), 0);
  const progressRows = progress.reduce((sum, table) => sum + Number(table.row_count ?? 0), 0);
  const objects = progress.reduce((sum, table) => sum + Number(table.object_count ?? 0), 0);
  const rows = archive?.status === 'building' ? progressRows : finalRows;
  const currentTable = progress.find((table) => table.status !== 'verified');
  const pending = api.archive.isPending || api.restore.isPending || api.dryRunDelete.isPending;
  const error = api.latest.error || api.progress.error || api.archive.error || api.restore.error || api.dryRunDelete.error;

  return (
    <section className="card space-y-3 p-5">
      <h2 className="font-semibold">Verified legacy workspace archive</h2>
      <p className="text-sm text-slate-500">Builds a resumable, checksummed R2 archive from an explicit table allow-list. Authentication records, API tokens, refresh tokens, and unsubscribe token hashes are excluded. No legacy rows are deleted by these controls.</p>
      {archive ? (
        <div className="rounded-md bg-slate-50 p-3 text-sm">
          <p><b>Archive:</b> {archive.status} · restore {archive.restore_status}</p>
          <p><b>{archive.status === 'building' ? 'Archived' : 'Verified'} rows:</b> {rows.toLocaleString()} · {objects.toLocaleString()} verified objects · created {new Date(archive.created_at).toLocaleString()}</p>
          {currentTable && <p><b>Current table:</b> {currentTable.table_name}</p>}
          {archive.last_error && <p className="text-red-700">{archive.last_error}</p>}
        </div>
      ) : <p className="text-sm text-slate-600">No archive has been started.</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn-secondary" disabled={pending} onClick={() => api.archive.mutate()}>{archive?.status === 'building' ? 'Resume one bounded step' : archive ? 'Start new archive' : 'Start archive'}</button>
        <button className="btn-secondary" disabled={pending || !archive || !['verified', 'deletion_eligible', 'deleted'].includes(archive.status) || archive.restore_status === 'verified'} onClick={() => api.restore.mutate()}>Restore next verified object</button>
        <button className="btn-secondary" disabled={pending || !archive || archive.status !== 'verified'} onClick={() => api.dryRunDelete.mutate()}>Dry-run deletion check</button>
      </div>
      <p className="text-xs text-amber-700">The deletion check can mark a fully reconciled archive eligible, but it never deletes data. Continue archive/restore one bounded object at a time; interrupted work resumes safely.</p>
      {error && <ErrorState error={error} />}
    </section>
  );
}
