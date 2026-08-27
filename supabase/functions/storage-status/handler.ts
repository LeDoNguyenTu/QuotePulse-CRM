import { corsHeaders, handleOptions, json } from '../_shared/cors.ts';
import { formatUnknownError } from '../_shared/errorMessage.ts';
import type { R2Usage } from '../_shared/r2Usage.ts';

export interface StorageCache extends R2Usage {
  refreshedAt: string;
}

export interface ArchiveAutomationStatus {
  status: 'succeeded' | 'degraded' | 'failed';
  pressure: 'warning' | 'high' | 'critical';
  databaseBytes: number;
  ownersProcessed: number;
  dealsArchived: number;
  genericAttachmentsArchived: number;
  error: string | null;
  finishedAt: string;
}

export type StorageCompactionState =
  | 'idle'
  | 'cooldown'
  | 'scheduled'
  | 'running'
  | 'retry_wait'
  | 'succeeded'
  | 'failed_closed';

export interface StorageCompactionStatus {
  state: StorageCompactionState;
  requestedAt: string | null;
  scheduledAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  nextRetryAt: string | null;
  attemptCount: number;
  databaseBytesBefore: number | null;
  databaseBytesAfter: number | null;
  dealToastBytesBefore: number | null;
  dealToastBytesAfter: number | null;
  lastError: string | null;
  skipReason: string | null;
}

export interface SnapshotStorageStatus {
  totalDeals: number;
  pendingSnapshots: number;
  archivedSnapshots: number;
}

export interface StorageStatusDependencies {
  authenticate: (request: Request) => Promise<string>;
  databaseBytes: () => Promise<number>;
  readCache: () => Promise<StorageCache | null>;
  writeCache: (usage: R2Usage, refreshedAt: string) => Promise<void>;
  r2Usage: () => Promise<R2Usage>;
  readArchiveAutomation: () => Promise<ArchiveAutomationStatus | null>;
  readSnapshotStatus: (ownerId: string) => Promise<SnapshotStorageStatus>;
  readCompactionStatus: () => Promise<StorageCompactionStatus>;
  now: () => Date;
  databaseLimitBytes: number;
  r2LimitBytes: number;
}

const CACHE_MS = 15 * 60 * 1_000;

function fresh(cache: StorageCache | null, now: Date): cache is StorageCache {
  if (!cache) return false;
  const refreshedAt = new Date(cache.refreshedAt).getTime();
  return Number.isFinite(refreshedAt) && now.getTime() - refreshedAt >= 0 && now.getTime() - refreshedAt < CACHE_MS;
}

export function createStorageStatusHandler(dependencies: StorageStatusDependencies) {
  return async (request: Request): Promise<Response> => {
    const preflight = handleOptions(request);
    if (preflight) return preflight;
    if (request.method !== 'GET') {
      return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json', Allow: 'GET, OPTIONS' },
      });
    }

    let ownerId: string;
    try {
      ownerId = await dependencies.authenticate(request);
    } catch (error) {
      return json({ ok: false, error: formatUnknownError(error) }, 401);
    }

    const now = dependencies.now();
    const database = await dependencies.databaseBytes()
      .then((usedBytes) => ({ usedBytes, limitBytes: dependencies.databaseLimitBytes }))
      .catch((error) => ({ limitBytes: dependencies.databaseLimitBytes, error: formatUnknownError(error) }));

    const r2 = await (async () => {
      try {
        const cache = await dependencies.readCache();
        if (fresh(cache, now)) {
          return { ...cache, limitBytes: dependencies.r2LimitBytes, cached: true };
        }
        const usage = await dependencies.r2Usage();
        await dependencies.writeCache(usage, now.toISOString());
        return { ...usage, limitBytes: dependencies.r2LimitBytes, cached: false };
      } catch (error) {
        return { limitBytes: dependencies.r2LimitBytes, error: formatUnknownError(error) };
      }
    })();

    const archiveAutomation = await dependencies.readArchiveAutomation().catch(() => null);
    const snapshots = await dependencies.readSnapshotStatus(ownerId)
      .catch((error) => ({ error: formatUnknownError(error) }));
    const compaction = await dependencies.readCompactionStatus()
      .catch((error) => ({ error: formatUnknownError(error) }));

    return json({ ok: true, measuredAt: now.toISOString(), database, r2, archiveAutomation, snapshots, compaction });
  };
}
