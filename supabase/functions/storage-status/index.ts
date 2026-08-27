import { getAdminClient, getUserId } from '../_shared/supabaseAdmin.ts';
import { readR2Usage, type R2Usage } from '../_shared/r2Usage.ts';
import {
  createStorageStatusHandler,
  type StorageCache,
  type StorageCompactionState,
} from './handler.ts';

function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function positiveLimit(name: string, fallback: number): number {
  const value = Number(Deno.env.get(name) ?? fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const admin = getAdminClient();

const handler = createStorageStatusHandler({
  authenticate: getUserId,
  databaseBytes: async () => {
    const { data, error } = await admin.rpc('storage_database_size_bytes');
    if (error) throw error;
    const bytes = Number(data);
    if (!Number.isFinite(bytes) || bytes < 0) throw new Error('Database size returned an invalid value.');
    return bytes;
  },
  readCache: async () => {
    const { data, error } = await admin
      .from('storage_usage_cache')
      .select('used_bytes, object_count, measured_at, refreshed_at, source')
      .eq('id', 'r2')
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      usedBytes: Number(data.used_bytes),
      objectCount: Number(data.object_count),
      measuredAt: data.measured_at as string,
      refreshedAt: data.refreshed_at as string,
      source: data.source as StorageCache['source'],
    };
  },
  writeCache: async (usage: R2Usage, refreshedAt: string) => {
    const { error } = await admin.from('storage_usage_cache').upsert({
      id: 'r2',
      used_bytes: usage.usedBytes,
      object_count: usage.objectCount,
      measured_at: usage.measuredAt,
      refreshed_at: refreshedAt,
      source: usage.source,
    });
    if (error) throw error;
  },
  r2Usage: () => readR2Usage({
    accountId: required('R2_ACCOUNT_ID'),
    bucket: required('R2_BUCKET'),
    accessKeyId: required('R2_ACCESS_KEY_ID'),
    secretAccessKey: required('R2_SECRET_ACCESS_KEY'),
    analyticsToken: Deno.env.get('CLOUDFLARE_API_TOKEN'),
  }),
  readArchiveAutomation: async () => {
    const { data, error } = await admin
      .from('storage_archive_runs')
      .select('status, pressure, database_bytes, owners_processed, deals_archived, generic_attachments_archived, error, finished_at')
      .order('finished_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      status: data.status as 'succeeded' | 'degraded' | 'failed',
      pressure: data.pressure as 'warning' | 'high' | 'critical',
      databaseBytes: Number(data.database_bytes),
      ownersProcessed: Number(data.owners_processed),
      dealsArchived: Number(data.deals_archived),
      genericAttachmentsArchived: Number(data.generic_attachments_archived),
      error: data.error as string | null,
      finishedAt: data.finished_at as string,
    };
  },
  readSnapshotStatus: async (ownerId: string) => {
    const { data, error } = await admin.rpc('deal_archive_storage_status', {
      p_owner_id: ownerId,
    });
    if (error) throw error;
    const status = data?.[0];
    if (!status) return { totalDeals: 0, pendingSnapshots: 0, archivedSnapshots: 0 };
    return {
      totalDeals: Number(status.total_deals),
      pendingSnapshots: Number(status.pending_snapshots),
      archivedSnapshots: Number(status.archived_snapshots),
    };
  },
  readCompactionStatus: async () => {
    const { data, error } = await admin.rpc('storage_compaction_status');
    if (error) throw error;
    const status = data?.[0];
    if (!status) throw new Error('Automatic compaction state is unavailable.');
    return {
      state: status.state as StorageCompactionState,
      requestedAt: status.requested_at as string | null,
      scheduledAt: status.scheduled_at as string | null,
      startedAt: status.started_at as string | null,
      finishedAt: status.finished_at as string | null,
      nextRetryAt: status.next_retry_at as string | null,
      attemptCount: Number(status.attempt_count),
      databaseBytesBefore: status.database_bytes_before == null ? null : Number(status.database_bytes_before),
      databaseBytesAfter: status.database_bytes_after == null ? null : Number(status.database_bytes_after),
      dealToastBytesBefore: status.deal_toast_bytes_before == null ? null : Number(status.deal_toast_bytes_before),
      dealToastBytesAfter: status.deal_toast_bytes_after == null ? null : Number(status.deal_toast_bytes_after),
      lastError: status.last_error as string | null,
      skipReason: status.skip_reason as string | null,
    };
  },
  now: () => new Date(),
  databaseLimitBytes: positiveLimit('DATABASE_SIZE_LIMIT_BYTES', 500_000_000),
  r2LimitBytes: positiveLimit('R2_STORAGE_LIMIT_BYTES', 10_000_000_000),
});

Deno.serve(handler);
