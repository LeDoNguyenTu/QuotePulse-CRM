import { corsHeaders, handleOptions, json } from '../_shared/cors.ts';
import { formatUnknownError } from '../_shared/errorMessage.ts';

export type ArchivePressure = 'safe' | 'warning' | 'critical';
export type ArchiveRunStatus = 'succeeded' | 'degraded' | 'failed';

export interface ArchiveBatchResult {
  deals_archived: number;
  generic_attachments_archived: number;
  warnings: string[];
}

export interface ArchiveRunRecord {
  status: ArchiveRunStatus;
  pressure: Exclude<ArchivePressure, 'safe'>;
  databaseBytes: number;
  limitBytes: number;
  ownersProcessed: number;
  dealsArchived: number;
  genericAttachmentsArchived: number;
  warnings: string[];
  error: string | null;
  finishedAt: string;
}

export interface StorageMaintenanceDependencies {
  authorize: (request: Request) => Promise<void>;
  databaseBytes: () => Promise<number>;
  claimLease: () => Promise<string | null>;
  releaseLease: (token: string) => Promise<void>;
  listOwners: () => Promise<string[]>;
  archiveOwner: (ownerId: string, limit: number) => Promise<ArchiveBatchResult>;
  recordRun: (run: ArchiveRunRecord) => Promise<void>;
  now: () => Date;
  databaseLimitBytes: number;
}

export interface ArchivePolicy {
  pressure: ArchivePressure;
  shouldRun: boolean;
  batchLimit: number;
}

export function archivePolicy(usedBytes: number, limitBytes: number, now: Date): ArchivePolicy {
  const ratio = limitBytes > 0 ? usedBytes / limitBytes : 1;
  if (ratio < 0.70) return { pressure: 'safe', shouldRun: false, batchLimit: 0 };
  if (ratio < 0.85) {
    return { pressure: 'warning', shouldRun: now.getUTCMinutes() % 15 === 0, batchLimit: 100 };
  }
  return { pressure: 'critical', shouldRun: true, batchLimit: 200 };
}

export function createStorageMaintenanceHandler(dependencies: StorageMaintenanceDependencies) {
  return async (request: Request): Promise<Response> => {
    const preflight = handleOptions(request);
    if (preflight) return preflight;
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json', Allow: 'POST, OPTIONS' },
      });
    }

    try {
      await dependencies.authorize(request);
    } catch (error) {
      return json({ ok: false, error: formatUnknownError(error) }, 401);
    }

    const now = dependencies.now();
    let databaseBytes: number;
    try {
      databaseBytes = await dependencies.databaseBytes();
    } catch (error) {
      return json({ ok: false, error: `Could not read database size: ${formatUnknownError(error)}` }, 500);
    }
    const policy = archivePolicy(databaseBytes, dependencies.databaseLimitBytes, now);
    if (!policy.shouldRun) {
      return json({
        ok: true,
        status: 'idle',
        pressure: policy.pressure,
        databaseBytes,
        limitBytes: dependencies.databaseLimitBytes,
      });
    }

    let leaseToken: string | null;
    try {
      leaseToken = await dependencies.claimLease();
    } catch (error) {
      return json({ ok: false, error: `Could not claim archive lease: ${formatUnknownError(error)}` }, 500);
    }
    if (!leaseToken) {
      return json({
        ok: true,
        status: 'idle',
        reason: 'already-running',
        pressure: policy.pressure,
        databaseBytes,
        limitBytes: dependencies.databaseLimitBytes,
      });
    }

    const warnings: string[] = [];
    const failures: string[] = [];
    let ownersProcessed = 0;
    let dealsArchived = 0;
    let genericAttachmentsArchived = 0;
    try {
      const owners = await dependencies.listOwners();
      for (const ownerId of owners) {
        try {
          const result = await dependencies.archiveOwner(ownerId, policy.batchLimit);
          ownersProcessed += 1;
          dealsArchived += Number(result.deals_archived ?? 0);
          genericAttachmentsArchived += Number(result.generic_attachments_archived ?? 0);
          const remaining = Math.max(0, 20 - warnings.length);
          warnings.push(...(result.warnings ?? []).slice(0, remaining).map((warning) => `${ownerId}: ${warning}`.slice(0, 500)));
        } catch (error) {
          if (failures.length < 20) failures.push(`${ownerId}: ${formatUnknownError(error)}`.slice(0, 500));
        }
      }
    } catch (error) {
      failures.push(formatUnknownError(error).slice(0, 500));
    }

    try {
      await dependencies.releaseLease(leaseToken);
    } catch (error) {
      failures.push(`Could not release archive lease: ${formatUnknownError(error)}`.slice(0, 500));
    }

    const status: ArchiveRunStatus = failures.length > 0 ? 'failed' : warnings.length > 0 ? 'degraded' : 'succeeded';
    const record: ArchiveRunRecord = {
      status,
      pressure: policy.pressure as Exclude<ArchivePressure, 'safe'>,
      databaseBytes,
      limitBytes: dependencies.databaseLimitBytes,
      ownersProcessed,
      dealsArchived,
      genericAttachmentsArchived,
      warnings,
      error: failures.length ? failures.join('; ') : null,
      finishedAt: dependencies.now().toISOString(),
    };
    try {
      await dependencies.recordRun(record);
    } catch (error) {
      failures.push(`Could not record archive run: ${formatUnknownError(error)}`);
    }

    const payload = {
      ok: failures.length === 0,
      status: failures.length === 0 ? status : 'failed',
      pressure: policy.pressure,
      databaseBytes,
      limitBytes: dependencies.databaseLimitBytes,
      ownersProcessed,
      dealsArchived,
      genericAttachmentsArchived,
      warnings,
      error: failures.length ? failures.join('; ') : undefined,
    };
    return json(payload, failures.length ? 500 : 200);
  };
}
