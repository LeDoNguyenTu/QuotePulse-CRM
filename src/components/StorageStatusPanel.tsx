import type { StorageServiceStatus, StorageStatusResult } from '../lib/functions';
import { capacityStatus, formatBytes, type CapacityTone } from '../lib/storageStatus';
import { useStorageStatus } from '../hooks/useStorageStatus';
import { Spinner } from './ui';

const TONE_CLASSES: Record<CapacityTone, string> = {
  safe: 'bg-emerald-500',
  warning: 'bg-amber-500',
  critical: 'bg-red-500',
};

function ServiceCapacity({
  label,
  service,
  detail,
}: {
  label: string;
  service: StorageServiceStatus;
  detail?: string;
}) {
  if (service.error || service.usedBytes == null) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-3">
        <div className="font-medium text-slate-800">{label}</div>
        <p className="mt-1 text-xs text-red-700">{service.error ?? 'Usage is temporarily unavailable.'}</p>
      </div>
    );
  }
  const status = capacityStatus(service.usedBytes, service.limitBytes);
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium text-slate-800">{label}</span>
        <span className="text-sm font-semibold text-slate-700">{status.percent}%</span>
      </div>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
        aria-label={`${label} storage used`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={status.progressPercent}
        aria-valuetext={`${status.percent}% used`}
      >
        <div className={`h-full rounded-full ${TONE_CLASSES[status.tone]}`} style={{ width: `${status.progressPercent}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs text-slate-500">
        <span>{formatBytes(status.usedBytes)} of {formatBytes(status.limitBytes)}</span>
        <span>{formatBytes(status.remainingBytes)} remaining</span>
      </div>
      {detail && <p className="mt-1 text-xs text-slate-400">{detail}</p>}
    </div>
  );
}

function r2Detail(r2: StorageStatusResult['r2']): string | undefined {
  const parts: string[] = [];
  if (r2.objectCount != null) parts.push(`${r2.objectCount.toLocaleString()} objects`);
  if (r2.source === 'r2-inventory') parts.push('exact object inventory');
  if (r2.source === 'cloudflare-analytics') parts.push('Cloudflare analytics');
  if (r2.cached) parts.push('cached');
  return parts.length ? parts.join(' · ') : undefined;
}

export function StorageStatusPanel() {
  const query = useStorageStatus();
  if (query.isLoading) {
    return <div className="card p-4"><Spinner label="Loading storage usage…" /></div>;
  }
  if (query.error || !query.data) {
    return (
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
        <span className="text-red-700">Storage usage is temporarily unavailable.</span>
        <button className="btn-secondary" onClick={() => void query.refetch()}>Retry</button>
      </div>
    );
  }

  const measured = new Date(query.data.measuredAt);
  return (
    <section className="card p-4" aria-labelledby="storage-status-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="storage-status-heading" className="font-semibold text-slate-800">Storage capacity</h2>
          <p className="text-xs text-slate-500">
            Updated {Number.isNaN(measured.getTime()) ? 'recently' : measured.toLocaleString()}
          </p>
        </div>
        <button className="btn-secondary" disabled={query.isFetching} onClick={() => void query.refetch()}>
          {query.isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <ServiceCapacity label="Supabase database" service={query.data.database} />
        <ServiceCapacity label="Cloudflare R2" service={query.data.r2} detail={r2Detail(query.data.r2)} />
      </div>
    </section>
  );
}
