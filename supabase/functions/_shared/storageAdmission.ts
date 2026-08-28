import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';

export type StorageAdmissionDecision =
  | 'allowed'
  | 'archiving'
  | 'capacity_guard'
  | 'compacting'
  | 'status_unavailable';

export interface StorageAdmissionResult {
  allowed: boolean;
  decision: StorageAdmissionDecision;
  status: 200 | 503;
  message: string;
  databaseBytes: number | null;
  limitBytes: number;
  compactionState: string | null;
  reason: string | null;
  leaseToken: string | null;
}

interface StorageAdmissionRow {
  decision: string;
  database_bytes: number | string;
  limit_bytes: number | string;
  archive_pending: boolean;
  compaction_state: string;
  reason: string | null;
  lease_token: string | null;
}

const DATABASE_STOP_BYTES = 410_000_000;
const DATABASE_LIMIT_BYTES = 500_000_000;
const SAFE_COMPACTION_STATES = new Set(['idle', 'succeeded']);
const KNOWN_DENIALS = new Set<StorageAdmissionDecision>(['archiving', 'capacity_guard', 'compacting']);

function unavailable(message = 'Storage recovery status is unavailable. HubSpot import is paused to protect CRM data.'):
  StorageAdmissionResult {
  return {
    allowed: false,
    decision: 'status_unavailable',
    status: 503,
    message,
    databaseBytes: null,
    limitBytes: DATABASE_LIMIT_BYTES,
    compactionState: null,
    reason: 'status-unavailable',
    leaseToken: null,
  };
}

function denialMessage(decision: StorageAdmissionDecision): string {
  if (decision === 'archiving') {
    return 'HubSpot import is paused while CRM snapshots are archived to R2.';
  }
  if (decision === 'compacting') {
    return 'HubSpot import is paused while automatic database compaction recovers storage capacity.';
  }
  return 'HubSpot import is paused because the database reached its safe capacity guard.';
}

export function decideStorageAdmission(data: unknown, error: unknown): StorageAdmissionResult {
  if (error) return unavailable();
  const row = Array.isArray(data) ? data[0] as Partial<StorageAdmissionRow> | undefined : undefined;
  if (!row || typeof row.decision !== 'string') return unavailable();

  const databaseBytes = Number(row.database_bytes);
  const limitBytes = Number(row.limit_bytes);
  if (!Number.isFinite(databaseBytes) || databaseBytes < 0 || !Number.isFinite(limitBytes) || limitBytes <= 0) {
    return unavailable();
  }

  if (KNOWN_DENIALS.has(row.decision as StorageAdmissionDecision)) {
    const decision = row.decision as StorageAdmissionDecision;
    return {
      allowed: false,
      decision,
      status: 503,
      message: denialMessage(decision),
      databaseBytes,
      limitBytes,
      compactionState: typeof row.compaction_state === 'string' ? row.compaction_state : null,
      reason: typeof row.reason === 'string' ? row.reason : null,
      leaseToken: null,
    };
  }

  if (
    row.decision !== 'allowed'
    || row.archive_pending !== false
    || typeof row.compaction_state !== 'string'
    || !SAFE_COMPACTION_STATES.has(row.compaction_state)
    || databaseBytes >= DATABASE_STOP_BYTES
    || typeof row.lease_token !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.lease_token)
  ) {
    return unavailable('Storage admission returned an unsafe or invalid state. HubSpot import remains paused.');
  }

  return {
    allowed: true,
    decision: 'allowed',
    status: 200,
    message: 'HubSpot import is allowed.',
    databaseBytes,
    limitBytes,
    compactionState: row.compaction_state,
    reason: null,
    leaseToken: row.lease_token,
  };
}

export async function assertStorageAdmission(
  admin: Pick<SupabaseClient, 'rpc'>,
  ownerId: string,
): Promise<StorageAdmissionResult> {
  try {
    const { data, error } = await admin.rpc('claim_storage_import_admission', {
      p_owner_id: ownerId,
      p_lease_seconds: 300,
    });
    return decideStorageAdmission(data, error);
  } catch {
    return unavailable();
  }
}

export async function releaseStorageAdmission(
  admin: Pick<SupabaseClient, 'rpc'>,
  leaseToken: string,
): Promise<void> {
  const { error } = await admin.rpc('release_storage_import_lease', { p_token: leaseToken });
  if (error) throw error;
}
