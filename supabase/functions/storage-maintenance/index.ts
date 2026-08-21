import { getAdminClient } from '../_shared/supabaseAdmin.ts';
import { createStorageMaintenanceHandler, type ArchiveBatchResult, type ArchiveRunRecord } from './handler.ts';

function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function inboundCronSecret(): string {
  return required('QUEUE_CRON_SECRET');
}

function archiveWorkerSecret(): string {
  return Deno.env.get('ARCHIVE_ADMIN_SECRET') ?? inboundCronSecret();
}

function positiveLimit(name: string, fallback: number): number {
  const value = Number(Deno.env.get(name) ?? fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const admin = getAdminClient();

const handler = createStorageMaintenanceHandler({
  authorize: async (request) => {
    const supplied = request.headers.get('x-storage-cron-secret') ?? '';
    if (!supplied || supplied !== inboundCronSecret()) throw new Error('Unauthorized');
  },
  databaseBytes: async () => {
    const { data, error } = await admin.rpc('storage_database_size_bytes');
    if (error) throw error;
    const bytes = Number(data);
    if (!Number.isFinite(bytes) || bytes < 0) throw new Error('Database size returned an invalid value.');
    return bytes;
  },
  claimLease: async () => {
    const { data, error } = await admin.rpc('claim_storage_archive_lease', { p_lease_seconds: 600 });
    if (error) throw error;
    return data ? String(data) : null;
  },
  releaseLease: async (token) => {
    const { error } = await admin.rpc('release_storage_archive_lease', { p_token: token });
    if (error) throw error;
  },
  listOwners: async () => {
    const { data, error } = await admin.rpc('storage_archive_owner_candidates');
    if (error) throw error;
    return ((data ?? []) as Array<{ owner_id: string }>).map((row) => row.owner_id);
  },
  archiveOwner: async (ownerId, limit) => {
    const response = await fetch(`${required('SUPABASE_URL')}/functions/v1/archive-hubspot-data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-archive-secret': archiveWorkerSecret(),
      },
      body: JSON.stringify({ owner_id: ownerId, limit }),
    });
    const payload = await response.json().catch(() => ({})) as Partial<ArchiveBatchResult> & { error?: string };
    if (!response.ok) throw new Error(payload.error ?? `Archive request failed with HTTP ${response.status}`);
    return {
      deals_archived: Number(payload.deals_archived ?? 0),
      generic_attachments_archived: Number(payload.generic_attachments_archived ?? 0),
      warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
    };
  },
  recordRun: async (run: ArchiveRunRecord) => {
    const { error } = await admin.from('storage_archive_runs').insert({
      status: run.status,
      pressure: run.pressure,
      database_bytes: run.databaseBytes,
      limit_bytes: run.limitBytes,
      owners_processed: run.ownersProcessed,
      deals_archived: run.dealsArchived,
      generic_attachments_archived: run.genericAttachmentsArchived,
      warnings: run.warnings,
      error: run.error,
      finished_at: run.finishedAt,
    });
    if (error) throw error;
  },
  now: () => new Date(),
  databaseLimitBytes: positiveLimit('DATABASE_SIZE_LIMIT_BYTES', 500_000_000),
});

Deno.serve(handler);
