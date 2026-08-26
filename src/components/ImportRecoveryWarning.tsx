import { useEffect, useState } from 'react';
import { formatRecoveryCountdown, type ImportRecoveryLock } from '../lib/storageStatus';

export function ImportRecoveryWarning({
  lock,
  now: fixedNow,
  onRefresh,
}: {
  lock: ImportRecoveryLock;
  now?: number;
  onRefresh?: () => void | Promise<unknown>;
}) {
  const [clock, setClock] = useState(() => fixedNow ?? Date.now());

  useEffect(() => {
    if (fixedNow != null || !lock.locked || lock.estimatedArchiveCompleteAt == null) return;
    const timer = window.setInterval(() => setClock(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [fixedNow, lock.estimatedArchiveCompleteAt, lock.locked]);

  useEffect(() => {
    if (!lock.locked || !onRefresh) return;
    const timer = window.setInterval(() => void onRefresh(), 60_000);
    return () => window.clearInterval(timer);
  }, [lock.locked, onRefresh]);

  if (!lock.locked) return null;

  const countdown = lock.estimatedArchiveCompleteAt == null
    ? null
    : formatRecoveryCountdown(lock.estimatedArchiveCompleteAt - clock);
  const critical = lock.phase === 'unavailable' || lock.phase === 'compaction-required';

  return (
    <section
      role="alert"
      aria-live="polite"
      className={`rounded-md border p-4 text-sm ${
        critical
          ? 'border-red-300 bg-red-50 text-red-900'
          : 'border-amber-300 bg-amber-50 text-amber-900'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">HubSpot import temporarily disabled</h2>
          <p className="mt-1">{lock.message}</p>
          {lock.pendingSnapshots != null && lock.pendingSnapshots > 0 && (
            <p className="mt-2 font-medium">
              {lock.pendingSnapshots.toLocaleString()} deal snapshots remaining
            </p>
          )}
          {countdown && (
            <p className="mt-1 font-mono text-base font-semibold">
              Estimated R2 archive countdown: {countdown}
            </p>
          )}
        </div>
        {onRefresh && (
          <button className="btn-secondary" onClick={() => void onRefresh()}>
            Refresh recovery status
          </button>
        )}
      </div>
    </section>
  );
}
