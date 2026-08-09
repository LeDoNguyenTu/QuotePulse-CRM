import type { IngestResult } from './functions';

const RETIRED_FILES_WARNING_PREFIX = 'HubSpot key cannot read Files:';

export function emptyImportResult(): IngestResult {
  return {
    ok: true,
    counts: {
      companies: 0,
      deals: 0,
      contacts: 0,
      attachments: 0,
      properties_backfilled: 0,
      skipped_trashed: 0,
      skipped_existing: 0,
    },
    errors: [],
    warnings: [],
    done: false,
  };
}

/** Upgrade reports persisted by earlier frontend releases. */
export function normalizeImportResult(result: IngestResult): IngestResult {
  return {
    ...result,
    counts: {
      ...result.counts,
      properties_backfilled: result.counts.properties_backfilled ?? 0,
    },
    warnings: (result.warnings ?? []).filter(
      (warning) => !warning.startsWith(RETIRED_FILES_WARNING_PREFIX)
    ),
  };
}

export function accumulateImportResult(current: IngestResult, next: IngestResult): IngestResult {
  const normalizedCurrent = normalizeImportResult(current);
  const normalizedNext = normalizeImportResult(next);
  const counts = { ...normalizedCurrent.counts };
  for (const key of Object.keys(counts) as (keyof IngestResult['counts'])[]) {
    counts[key] += normalizedNext.counts?.[key] ?? 0;
  }
  return {
    ...normalizedCurrent,
    ok: normalizedCurrent.ok && normalizedNext.ok,
    counts,
    errors: [...new Set([...normalizedCurrent.errors, ...(normalizedNext.errors ?? [])])],
    warnings: [...new Set([...normalizedCurrent.warnings, ...(normalizedNext.warnings ?? [])])],
    done: normalizedNext.done ?? normalizedCurrent.done,
    progress: normalizedNext.progress ?? normalizedCurrent.progress,
  };
}

export function postImportStepAction({
  stepDone,
  stopRequested,
}: {
  stepDone: boolean;
  stopRequested: boolean;
}): 'complete' | 'pause' | 'continue' {
  if (stepDone) return 'complete';
  return stopRequested ? 'pause' : 'continue';
}

export function shouldShowLiveImport(
  status: string | undefined,
  hasLiveState: boolean
): boolean {
  return status === 'running' && hasLiveState;
}
