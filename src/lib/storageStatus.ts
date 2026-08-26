export type CapacityTone = 'safe' | 'warning' | 'critical';

export interface ArchiveAutomationSummaryInput {
  status: 'succeeded' | 'degraded' | 'failed';
  pressure: 'warning' | 'critical';
  databaseBytes: number;
  ownersProcessed: number;
  dealsArchived: number;
  genericAttachmentsArchived: number;
  error: string | null;
  finishedAt: string;
}

export interface CapacityStatus {
  usedBytes: number;
  limitBytes: number;
  remainingBytes: number;
  percent: number;
  progressPercent: number;
  tone: CapacityTone;
}

export interface SnapshotStorageStatus {
  totalDeals: number;
  pendingSnapshots: number;
  archivedSnapshots: number;
}

export type StorageRecoveryState = 'archiving' | 'compaction-required' | 'normal';

export function capacityStatus(usedBytes: number, limitBytes: number): CapacityStatus {
  const used = Math.max(0, Number.isFinite(usedBytes) ? usedBytes : 0);
  const limit = Math.max(1, Number.isFinite(limitBytes) ? limitBytes : 1);
  const percent = Math.round((used / limit) * 1_000) / 10;
  return {
    usedBytes: used,
    limitBytes: limit,
    remainingBytes: Math.max(0, limit - used),
    percent,
    progressPercent: Math.min(100, percent),
    tone: percent >= 85 ? 'critical' : percent >= 70 ? 'warning' : 'safe',
  };
}

export function archiveAutomationSummary(run: ArchiveAutomationSummaryInput): string {
  if (run.status === 'failed') return `Automatic archive failed: ${run.error ?? 'unknown error'}`;
  if (run.status === 'degraded') return 'Automatic archive completed with warnings and will retry remaining data.';
  return `Archived ${run.dealsArchived.toLocaleString()} deal snapshots and ${run.genericAttachmentsArchived.toLocaleString()} attachment records across ${run.ownersProcessed.toLocaleString()} accounts.`;
}

export function storageRecoverySummary(
  snapshots: SnapshotStorageStatus,
  database: { usedBytes: number; limitBytes: number },
): { state: StorageRecoveryState; message: string } {
  if (snapshots.pendingSnapshots > 0) {
    return {
      state: 'archiving',
      message: `${snapshots.pendingSnapshots.toLocaleString()} deal snapshots are still moving to R2. Supabase allocated size will fall only after compaction.`,
    };
  }
  if (database.usedBytes >= database.limitBytes) {
    return {
      state: 'compaction-required',
      message: 'All deal snapshots are in R2. Database compaction is still required to reclaim Supabase space.',
    };
  }
  return {
    state: 'normal',
    message: 'Storage recovery is complete: deal snapshots are in R2 and Supabase is below its limit.',
  };
}

export function formatBytes(bytes: number): string {
  const value = Math.max(0, Number.isFinite(bytes) ? bytes : 0);
  if (value < 1_000) return `${Math.round(value)} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let scaled = value;
  let unit = -1;
  do {
    scaled /= 1_000;
    unit += 1;
  } while (scaled >= 1_000 && unit < units.length - 1);
  const digits = scaled >= 100 || Number.isInteger(scaled) ? 0 : scaled >= 10 ? 1 : 2;
  return `${scaled.toFixed(digits)} ${units[unit]}`;
}
