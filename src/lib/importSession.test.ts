import { describe, expect, it } from 'vitest';
import {
  accumulateImportResult,
  emptyImportResult,
  normalizeImportResult,
  postImportStepAction,
  shouldShowLiveImport,
} from './importSession';
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

  it('keeps only the first copy of identical errors across retried slices', () => {
    const failure = 'deal 6332608887: invalid input syntax for type timestamp with time zone';
    const first = accumulateImportResult(emptyImportResult(), {
      ...emptyImportResult(),
      ok: false,
      errors: [failure],
    });
    const next = accumulateImportResult(first, {
      ...emptyImportResult(),
      ok: false,
      errors: [failure, 'deal 6334852391: invalid timestamp'],
    });

    expect(next.errors).toEqual([
      failure,
      'deal 6334852391: invalid timestamp',
    ]);
  });

  it('keeps the last known progress counts when a throttled slice cannot count rows', () => {
    const first = accumulateImportResult(emptyImportResult(), {
      ...emptyImportResult(),
      progress: {
        deals_in_hubspot: 186_723,
        deals_imported: 184_809,
        companies: 62_110,
        phase: 'backfill',
      },
    });
    const next = accumulateImportResult(first, {
      ...emptyImportResult(),
      progress: {
        deals_in_hubspot: 186_723,
        deals_imported: null,
        companies: null,
        phase: 'backfill',
      },
    });

    expect(next.progress).toEqual({
      deals_in_hubspot: 186_723,
      deals_imported: 184_809,
      companies: 62_110,
      phase: 'backfill',
    });
  });

  it('does not preserve a legacy false-zero snapshot when the next count is unavailable', () => {
    const first = accumulateImportResult(emptyImportResult(), {
      ...emptyImportResult(),
      progress: {
        deals_in_hubspot: 186_723,
        deals_imported: 0,
        companies: 0,
        phase: 'backfill',
      },
    });
    const next = accumulateImportResult(first, {
      ...emptyImportResult(),
      progress: {
        deals_in_hubspot: 186_723,
        deals_imported: null,
        companies: null,
        phase: 'backfill',
      },
    });

    expect(next.progress?.deals_imported).toBeNull();
    expect(next.progress?.companies).toBeNull();
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

  it('removes the retired Files-scope warning from persisted import reports', () => {
    const legacy = {
      ...emptyImportResult(),
      warnings: [
        'HubSpot key cannot read Files: attachments were imported without their real file names.',
        'Keep this warning',
      ],
    };

    expect(normalizeImportResult(legacy).warnings).toEqual(['Keep this warning']);
  });

  it('honors a stop requested while the server step was in flight', () => {
    expect(postImportStepAction({ stepDone: false, stopRequested: true })).toBe('pause');
    expect(postImportStepAction({ stepDone: false, stopRequested: false })).toBe('continue');
    expect(postImportStepAction({ stepDone: true, stopRequested: true })).toBe('complete');
  });

  it('hides live timing and animation for every non-running status', () => {
    expect(shouldShowLiveImport('running', true)).toBe(true);
    expect(shouldShowLiveImport('paused', true)).toBe(false);
    expect(shouldShowLiveImport('complete', true)).toBe(false);
    expect(shouldShowLiveImport('failed', true)).toBe(false);
    expect(shouldShowLiveImport('running', false)).toBe(false);
  });
});
