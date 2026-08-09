import { describe, expect, it } from 'vitest';
import { accumulateImportResult, emptyImportResult, normalizeImportResult } from './importSession';
import type { IngestResult } from './functions';

describe('HubSpot import session', () => {
  it('keeps cumulative counts and unique warnings across resumable slices', () => {
    const first = accumulateImportResult(emptyImportResult(), {
      ok: true,
      counts: { companies: 2, deals: 3, contacts: 1, attachments: 0, properties_backfilled: 7, skipped_trashed: 0, skipped_existing: 4 },
      warnings: ['Missing notes scope'],
      errors: [],
      done: false,
    });
    const next = accumulateImportResult(first, {
      ok: true,
      counts: { companies: 1, deals: 2, contacts: 0, attachments: 1, properties_backfilled: 5, skipped_trashed: 0, skipped_existing: 5 },
      warnings: ['Missing notes scope'],
      errors: [],
      done: true,
    });

    expect(next.counts).toMatchObject({ companies: 3, deals: 5, attachments: 1, properties_backfilled: 12, skipped_existing: 9 });
    expect(next.warnings).toEqual(['Missing notes scope']);
    expect(next.done).toBe(true);
  });

  it('normalizes reports saved before property-backfill counts existed', () => {
    const legacy = {
      ...emptyImportResult(),
      counts: {
        companies: 1,
        deals: 2,
        contacts: 3,
        attachments: 4,
        skipped_trashed: 0,
        skipped_existing: 5,
      },
    } as unknown as IngestResult;

    expect(normalizeImportResult(legacy).counts.properties_backfilled).toBe(0);
  });
});
