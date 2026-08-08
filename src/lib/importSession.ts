import type { IngestResult } from './functions';

export function emptyImportResult(): IngestResult {
  return {
    ok: true,
    counts: {
      companies: 0,
      deals: 0,
      contacts: 0,
      attachments: 0,
      skipped_trashed: 0,
      skipped_existing: 0,
    },
    errors: [],
    warnings: [],
    done: false,
  };
}

export function accumulateImportResult(current: IngestResult, next: IngestResult): IngestResult {
  const counts = { ...current.counts };
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
