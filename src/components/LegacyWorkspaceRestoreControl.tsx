type Props = {
  restoreStatus: 'not_started' | 'restoring' | 'verified' | 'failed';
  pending: boolean;
  onRestore: () => void;
  onStop: () => void;
};

export function LegacyWorkspaceRestoreControl({ restoreStatus, pending, onRestore, onStop }: Props) {
  if (restoreStatus === 'verified') {
    return <span className="text-xs font-semibold text-emerald-700">All Legacy data restored</span>;
  }

  return <div className="flex flex-wrap items-center gap-2">
    <button className="btn-primary" type="button" disabled={pending} onClick={onRestore}>
      {pending ? 'Restoring all Legacy data…' : restoreStatus === 'failed' ? 'Resume full data restore' : 'Restore all data to normal CRM'}
    </button>
    {pending && <button className="btn-secondary" type="button" onClick={onStop}>Pause safely</button>}
  </div>;
}
