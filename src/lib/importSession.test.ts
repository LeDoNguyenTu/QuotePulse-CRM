import { describe, expect, it } from 'vitest';
import { accumulateImportResult, emptyImportResult } from './importSession';

describe('HubSpot import session', () => {
  it('keeps cumulative counts and unique warnings across resumable slices', () => {
    const first = accumulateImportResult(emptyImportResult(), {
      ok: true,
      counts: { companies: 2, deals: 3, contacts: 1, attachments: 0, skipped_trashed: 0, skipped_existing: 4 },
      warnings: ['Missing notes scope'],
      errors: [],
      done: false,
    });
    const next = accumulateImportResult(first, {
      ok: true,
      counts: { companies: 1, deals: 2, contacts: 0, attachments: 1, skipped_trashed: 0, skipped_existing: 5 },
      warnings: ['Missing notes scope'],
      errors: [],
      done: true,
    });

    expect(next.counts).toMatchObject({ companies: 3, deals: 5, attachments: 1, skipped_existing: 9 });
    expect(next.warnings).toEqual(['Missing notes scope']);
    expect(next.done).toBe(true);
  });
});
