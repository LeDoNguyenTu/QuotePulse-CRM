import type { ReactNode } from 'react';
import type { SendStatus, SourcePriority } from '../lib/types';

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
      {label ?? 'Loading…'}
    </div>
  );
}

export function ErrorState({ error }: { error: unknown }) {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
      {msg}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
      {children}
    </div>
  );
}

const PRIORITY_STYLES: Record<SourcePriority, string> = {
  recycled: 'bg-amber-100 text-amber-800',
  deleted: 'bg-rose-100 text-rose-800',
  current: 'bg-emerald-100 text-emerald-800',
};

export function PriorityBadge({ value }: { value: SourcePriority }) {
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${PRIORITY_STYLES[value]}`}
    >
      {value}
    </span>
  );
}

const STATUS_STYLES: Record<SendStatus, string> = {
  queued: 'bg-slate-100 text-slate-700',
  sent: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-red-100 text-red-800',
  blocked: 'bg-orange-100 text-orange-800',
  deferred: 'bg-yellow-100 text-yellow-800',
};

export function StatusBadge({ value }: { value: SendStatus | null }) {
  if (!value) return <span className="text-xs text-slate-400">—</span>;
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[value]}`}
    >
      {value}
    </span>
  );
}

export function Flag({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      title={label}
      className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
        on ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-400'
      }`}
    >
      {label}
    </span>
  );
}
