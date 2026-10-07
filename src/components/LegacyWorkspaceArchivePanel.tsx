import { useState } from 'react';
import { useActiveWorkspace } from '../hooks/useWorkspaces';
import { useWorkspaceArchive } from '../hooks/useWorkspaceArchive';
import { ErrorState } from './ui';

export function LegacyWorkspaceArchivePanel() {
  const workspace = useActiveWorkspace();
  const api = useWorkspaceArchive(workspace.id);
  const archive = api.latest.data;
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const progress = api.progress.data ?? [];
  const finalRows = Object.values(archive?.table_counts ?? {}).reduce((sum, count) => sum + Number(count), 0);
  const progressRows = progress.reduce((sum, table) => sum + Number(table.row_count ?? 0), 0);
  const objects = progress.reduce((sum, table) => sum + Number(table.object_count ?? 0), 0);
  const rows = archive?.status === 'building' ? progressRows : finalRows;
  const currentTable = archive?.status === 'building' ? progress.find((table) => table.status !== 'verified') : undefined;
  const deletingTable = progress.find((table) => table.deletion_status === 'deleting');
  const deletedRows = progress.reduce((sum, table) => sum + Number(table.deletion_row_count ?? 0), 0);
  const retainedRows = progress.reduce((sum, table) => sum + Number(table.deletion_retained_count ?? 0), 0);
  const archiveComplete = !!archive && ['verified', 'deletion_eligible', 'deleting', 'deleted'].includes(archive.status);
  const expectedConfirmation = `DELETE ${finalRows}`;
  const pending = api.archive.isPending || api.archiveAll.isPending || api.restore.isPending || api.dryRunDelete.isPending || api.verifyAllForDeletion.isPending || api.deleteAll.isPending;
  const error = api.latest.error || api.progress.error || api.deletionVerification.error || api.archive.error || api.archiveAll.error || api.restore.error || api.dryRunDelete.error || api.verifyAllForDeletion.error || api.deleteAll.error;

  return (
    <section className="card space-y-3 p-5">
      <h2 className="font-semibold">Verified legacy workspace archive</h2>
      <p className="text-sm text-slate-500">Builds a resumable, checksummed R2 archive from an explicit table allow-list. Authentication records, API tokens, refresh tokens, and unsubscribe token hashes are excluded. Archive and verification controls do not delete legacy rows.</p>
      {archive ? (
        <div className="rounded-md bg-slate-50 p-3 text-sm">
          <p><b>Archive:</b> {archive.status} · restore {archive.restore_status}</p>
          <p><b>{archive.status === 'building' ? 'Archived' : 'Verified'} rows:</b> {rows.toLocaleString()} · {objects.toLocaleString()} verified objects · created {new Date(archive.created_at).toLocaleString()}</p>
          {currentTable && <p><b>Current table:</b> {currentTable.table_name}</p>}
          {api.deletionVerification.data && <p><b>Deletion verification:</b> {api.deletionVerification.data.verified.toLocaleString()} / {api.deletionVerification.data.total.toLocaleString()} archive objects deletion-verified</p>}
          {archive.status === 'deleting' && <p><b>Deleted rows:</b> {deletedRows.toLocaleString()} / {finalRows.toLocaleString()}{deletingTable ? ` · ${deletingTable.table_name}` : ''}</p>}
          {archive.status === 'deleted' && <p><b>Deletion complete:</b> {deletedRows.toLocaleString()} removed · {retainedRows.toLocaleString()} protected referenced rows retained</p>}
          {archive.last_error && <p className="text-red-700">{archive.last_error}</p>}
        </div>
      ) : <p className="text-sm text-slate-600">No archive has been started.</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={pending || archiveComplete} onClick={() => api.archiveAll.mutate()}>{archiveComplete ? 'Archive complete' : archive?.status === 'building' ? 'Archive all remaining data' : 'Start and archive all'}</button>
        {api.archiveAll.isPending && <button className="btn-secondary" onClick={api.stopArchiveAll}>Stop after current step</button>}
        <button className="btn-secondary" disabled={pending} onClick={() => api.archive.mutate()}>{archive?.status === 'building' ? 'Resume one bounded step' : archive ? 'Start new archive' : 'Start archive'}</button>
        <button className="btn-secondary" disabled={pending || !archive || !['verified', 'deletion_eligible', 'deleted'].includes(archive.status) || archive.restore_status === 'verified'} onClick={() => api.restore.mutate()}>Restore next verified object</button>
        <button className="btn-secondary" disabled={pending || !archive || archive.status !== 'verified'} onClick={() => api.dryRunDelete.mutate()}>Dry-run deletion check</button>
        <button className="btn-secondary" disabled={pending || !archive || archive.status !== 'verified'} onClick={() => api.verifyAllForDeletion.mutate()}>Verify all archive objects</button>
        {(api.verifyAllForDeletion.isPending || api.deleteAll.isPending) && <button className="btn-secondary" onClick={api.stopDeletionWork}>Stop after current step</button>}
      </div>
      {archive && ['deletion_eligible', 'deleting', 'deleted'].includes(archive.status) && <div className="space-y-2 rounded-md border border-red-200 bg-red-50 p-3">
        <p className="text-sm font-semibold text-red-800">Delete archived legacy rows</p>
        <p className="text-xs text-red-700">This permanently removes safely deletable live Supabase rows to release database space. Referenced security or Sales CRM rows are retained so no excluded records or relationships are lost. Restore remains available from the verified R2 archive. Type <code>{expectedConfirmation}</code> to unlock deletion.</p>
        <input aria-label="Archive deletion confirmation" className="input" value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} placeholder={expectedConfirmation} disabled={archive.status === 'deleted'} />
        <button className="btn-danger" disabled={pending || archive.status === 'deleted' || deleteConfirmation !== expectedConfirmation} onClick={() => api.deleteAll.mutate(deleteConfirmation)}>{archive.status === 'deleted' ? 'Legacy rows deleted' : archive.status === 'deleting' ? 'Resume deleting archived legacy rows' : 'Delete archived legacy rows'}</button>
      </div>}
      <p className="text-xs text-amber-700">Every operation repeats a bounded, resumable server step. Stop or close this page at any time; the next run resumes safely. Deletion stays locked until every R2 object is checksum-verified again.</p>
      {error && <ErrorState error={error} />}
    </section>
  );
}
