import type { StorageCompactionStatus } from './functions';

export type CapacityTone = 'safe' | 'warning' | 'critical';

export interface ArchiveAutomationSummaryInput {
  status: 'succeeded' | 'degraded' | 'failed';
  pressure: 'warning' | 'high' | 'critical';
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

export type StorageRecoveryState =
  | 'archiving'
  | 'capacity-guard'
  | 'cooldown'
  | 'scheduled'
  | 'running'
  | 'retry-wait'
  | 'failed-closed'
  | 'normal';

export type ImportRecoveryPhase = 'checking' | 'unavailable' | 'archiving' | 'compaction-required' | 'ready';

export interface ImportRecoveryLock {
  locked: boolean;
  phase: ImportRecoveryPhase;
  pendingSnapshots: number | null;
  estimatedArchiveCompleteAt: number | null;
  message: string;
}

interface ImportRecoveryStatus {
  measuredAt: string;
  database: {
    usedBytes?: number;
    limitBytes: number;
    error?: string;
  };
  archiveAutomation: {
    status: 'succeeded' | 'degraded' | 'failed';
    dealsArchived: number;
    finishedAt: string;
  } | null;
  snapshots?: SnapshotStorageStatus | { error: string };
  compaction?: StorageCompactionStatus | { error: string };
}

const ARCHIVE_START_RATIO = 0.60;
const FAST_POLL_RATIO = 0.75;
const IMPORT_STOP_RATIO = 0.82;
const NORMAL_POLL_MS = 5 * 60_000;
const RECOVERY_POLL_MS = 60_000;
const VALID_COMPACTION_STATES = new Set([
  'idle',
  'cooldown',
  'scheduled',
  'running',
  'retry_wait',
  'succeeded',
  'failed_closed',
]);

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
    tone: percent >= IMPORT_STOP_RATIO * 100
      ? 'critical'
      : percent >= ARCHIVE_START_RATIO * 100
      ? 'warning'
      : 'safe',
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
  compaction: StorageCompactionStatus,
): { state: StorageRecoveryState; message: string } {
  if (snapshots.pendingSnapshots > 0) {
    return {
      state: 'archiving',
      message: `${snapshots.pendingSnapshots.toLocaleString()} deal snapshots are still moving to R2. Supabase allocated size will fall only after compaction.`,
    };
  }
  if (compaction.state === 'failed_closed') {
    return {
      state: 'failed-closed',
      message: `Automatic recovery stopped safely${compaction.lastError ? `: ${compaction.lastError}` : '.'} Manual support is required; imports remain blocked.`,
    };
  }
  if (compaction.state === 'running') {
    return {
      state: 'running',
      message: 'Automatic TOAST compaction is running. Imports and archive work remain paused to protect database I/O.',
    };
  }
  if (compaction.state === 'scheduled') {
    return {
      state: 'scheduled',
      message: `Database compaction is scheduled automatically${compaction.scheduledAt ? ` for ${new Date(compaction.scheduledAt).toLocaleString()}` : ''}.`,
    };
  }
  if (compaction.state === 'retry_wait') {
    return {
      state: 'retry-wait',
      message: `Automatic compaction paused to protect database I/O and will retry${compaction.nextRetryAt ? ` after ${new Date(compaction.nextRetryAt).toLocaleString()}` : ' later'}.`,
    };
  }
  if (compaction.state === 'cooldown') {
    return {
      state: 'cooldown',
      message: 'Archive verification is complete. Automatic compaction is waiting for the cooldown and a quiet database window.',
    };
  }
  if (database.usedBytes >= database.limitBytes * IMPORT_STOP_RATIO) {
    return {
      state: 'capacity-guard',
      message: 'The capacity guard is active. Automatic recovery is evaluating the next safe compaction opportunity.',
    };
  }
  return {
    state: 'normal',
    message: 'Storage recovery is complete: deal snapshots are in R2 and Supabase is below its limit.',
  };
}

export function importRecoveryLock(
  status: ImportRecoveryStatus | null | undefined,
  query: { loading?: boolean; failed?: boolean } = {},
): ImportRecoveryLock {
  if (query.loading && !status) {
    return {
      locked: true,
      phase: 'checking',
      pendingSnapshots: null,
      estimatedArchiveCompleteAt: null,
      message: 'Checking Supabase storage recovery. HubSpot import remains disabled until this check completes.',
    };
  }

  const snapshots = status?.snapshots;
  const compaction = status?.compaction;
  if (
    query.failed ||
    !status ||
    status.database.error ||
    status.database.usedBytes == null ||
    !snapshots ||
    'error' in snapshots ||
    !compaction ||
    'error' in compaction ||
    !VALID_COMPACTION_STATES.has(compaction.state)
  ) {
    return {
      locked: true,
      phase: 'unavailable',
      pendingSnapshots: null,
      estimatedArchiveCompleteAt: null,
      message: 'Storage recovery could not be verified. HubSpot import remains disabled to protect the database.',
    };
  }

  const pendingSnapshots = Math.max(0, snapshots.pendingSnapshots);
  if (pendingSnapshots > 0) {
    const measuredAt = Date.parse(status.measuredAt);
    const latestRunAt = status.archiveAutomation ? Date.parse(status.archiveAutomation.finishedAt) : Number.NaN;
    const batchSize = status.archiveAutomation?.status !== 'failed'
      ? Math.max(0, status.archiveAutomation?.dealsArchived ?? 0)
      : 0;
    const recentRun = Number.isFinite(measuredAt) && Number.isFinite(latestRunAt) &&
      Math.abs(measuredAt - latestRunAt) <= 3 * 60_000;
    const estimatedArchiveCompleteAt = recentRun && batchSize > 0
      ? measuredAt + Math.ceil(pendingSnapshots / batchSize) * 60_000
      : null;

    return {
      locked: true,
      phase: 'archiving',
      pendingSnapshots,
      estimatedArchiveCompleteAt,
      message: 'Storage recovery is moving deal snapshots to R2. Import remains disabled until archival and database compaction are complete.',
    };
  }

  if (compaction.state === 'failed_closed') {
    return {
      locked: true,
      phase: 'compaction-required',
      pendingSnapshots: 0,
      estimatedArchiveCompleteAt: null,
      message: `Automatic storage recovery stopped safely${compaction.lastError ? `: ${compaction.lastError}` : '.'} HubSpot import remains disabled until the issue is resolved.`,
    };
  }

  if (['cooldown', 'scheduled', 'running', 'retry_wait'].includes(compaction.state)) {
    return {
      locked: true,
      phase: 'compaction-required',
      pendingSnapshots: 0,
      estimatedArchiveCompleteAt: null,
      message: 'Automatic database compaction is pending or active. HubSpot import will resume after capacity is verified safe.',
    };
  }

  if (status.database.usedBytes >= status.database.limitBytes * IMPORT_STOP_RATIO) {
    return {
      locked: true,
      phase: 'compaction-required',
      pendingSnapshots: 0,
      estimatedArchiveCompleteAt: null,
      message: 'The storage capacity guard is active. Automatic compaction will run at the next safe opportunity before HubSpot import resumes.',
    };
  }

  return {
    locked: false,
    phase: 'ready',
    pendingSnapshots: 0,
    estimatedArchiveCompleteAt: null,
    message: 'Storage recovery is complete and HubSpot import is available.',
  };
}

export function storageStatusPollInterval(status: ImportRecoveryStatus | null | undefined): number {
  if (!status || status.database.error || status.database.usedBytes == null || !status.compaction) {
    return RECOVERY_POLL_MS;
  }
  if ('error' in status.compaction) return RECOVERY_POLL_MS;
  const snapshots = status.snapshots;
  if (!snapshots || 'error' in snapshots) return RECOVERY_POLL_MS;
  const recoveryActive = !['idle', 'succeeded'].includes(status.compaction.state)
    || snapshots.pendingSnapshots > 0;
  const ratio = status.database.limitBytes > 0
    ? status.database.usedBytes / status.database.limitBytes
    : 1;
  return recoveryActive || ratio >= FAST_POLL_RATIO ? RECOVERY_POLL_MS : NORMAL_POLL_MS;
}

export function formatRecoveryCountdown(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(Number.isFinite(milliseconds) ? milliseconds / 1_000 : 0));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
}

export function shouldStopImportForRecovery(
  importing: boolean,
  stopRequested: boolean,
  recoveryLocked: boolean,
): boolean {
  return importing && recoveryLocked && !stopRequested;
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
