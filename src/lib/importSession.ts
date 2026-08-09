import type { IngestResult } from './functions';

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
  };
}

export function accumulateImportResult(current: IngestResult, next: IngestResult): IngestResult {
  const counts = { ...normalizeImportResult(current).counts };
  for (const key of Object.keys(counts) as (keyof IngestResult['counts'])[]) {
    counts[key] += next.counts?.[key] ?? 0;
  }
  return {
    ...current,
    ok: current.ok && next.ok,
    counts,
    errors: [...current.errors, ...(next.errors ?? [])],
    warnings: [...new Set([...current.warnings, ...(next.warnings ?? [])])],
    done: next.done ?? current.done,
    progress: next.progress ?? current.progress,
  };
}
