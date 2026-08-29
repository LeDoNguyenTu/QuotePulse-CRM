import { describe, expect, it } from 'vitest';
import {
  backfillStartCursor,
  canAdvanceIncrementalWatermark,
  encodeIncrementalSyncCursor,
  encodeVerifiedDealTotal,
  fullReconciliationDue,
  incrementalSearchStartCursors,
  incrementalSearchNeedsReconciliation,
  incrementalWatermarkWithOverlap,
  isDealCountCaughtUp,
  isVerifiedIncrementalTotalCurrent,
  pageFullyProcessed,
  resumeIncrementalSyncCursor,
  shouldSkipUnchangedDeal,
  syncRunComplete,
} from './hubspotSync';

describe('HubSpot sync cursor guards', () => {
  it('does not advance an incremental watermark when any object failed', () => {
    expect(canAdvanceIncrementalWatermark(0)).toBe(true);
    expect(canAdvanceIncrementalWatermark(1)).toBe(false);
  });

  it('persists and resumes an incremental page only for the same watermark', () => {
    const encoded = encodeIncrementalSyncCursor({
      watermark: '2026-08-26T00:00:07.663Z',
      startedAt: '2026-08-29T12:30:00.000Z',
      after: '200',
    });
    expect(resumeIncrementalSyncCursor(
      encoded,
      '2026-08-26T00:00:07.663Z',
      '2026-08-29T12:31:00.000Z',
    )).toEqual({
      watermark: '2026-08-26T00:00:07.663Z',
      startedAt: '2026-08-29T12:30:00.000Z',
      after: '200',
    });
    expect(resumeIncrementalSyncCursor(
      encoded,
      '2026-08-29T12:32:00.000Z',
      '2026-08-29T12:33:00.000Z',
    )).toEqual({
      watermark: '2026-08-29T12:32:00.000Z',
      startedAt: '2026-08-29T12:33:00.000Z',
      after: null,
    });
  });

  it('checks the newest page before resuming the saved incremental backlog', () => {
    expect(incrementalSearchStartCursors('200'))
      .toEqual([undefined, '200']);
    expect(incrementalSearchStartCursors(null))
      .toEqual([undefined]);
  });

  it('starts reconciliation from the top instead of using a verified-total marker', () => {
    expect(backfillStartCursor('incremental', 'verified-total:186734')).toBeUndefined();
    expect(backfillStartCursor('backfill', '18368245929')).toBe('18368245929');
  });

  it('falls back to full reconciliation before requesting beyond HubSpot search limits', () => {
    expect(incrementalSearchNeedsReconciliation('9900')).toBe(false);
    expect(incrementalSearchNeedsReconciliation('10000')).toBe(true);
    expect(incrementalSearchNeedsReconciliation(null)).toBe(false);
  });

  it('keeps an overlap when advancing the incremental watermark', () => {
    expect(incrementalWatermarkWithOverlap(
      '2026-08-29T12:00:00.000Z',
      '2026-08-29T12:20:00.000Z',
      15 * 60 * 1000,
    )).toBe('2026-08-29T12:05:00.000Z');
    expect(incrementalWatermarkWithOverlap(
      '2026-08-29T12:00:00.000Z',
      '2026-08-29T12:05:00.000Z',
      15 * 60 * 1000,
    )).toBe('2026-08-29T12:00:00.000Z');
  });

  it('periodically requires a full reconciliation even when counts match', () => {
    const now = Date.parse('2026-08-30T12:00:00.000Z');
    expect(fullReconciliationDue(null, now, 24 * 60 * 60 * 1000)).toBe(true);
    expect(fullReconciliationDue(
      '2026-08-29T11:59:59.999Z',
      now,
      24 * 60 * 60 * 1000,
    )).toBe(true);
    expect(fullReconciliationDue(
      '2026-08-29T12:00:00.001Z',
      now,
      24 * 60 * 60 * 1000,
    )).toBe(false);
  });

  it('does not complete while a durable deal retry is unresolved or uncountable', () => {
    const stages = [true, true, true, true, true];
    expect(syncRunComplete(stages, 0)).toBe(true);
    expect(syncRunComplete(stages, 1)).toBe(false);
    expect(syncRunComplete(stages, null)).toBe(false);
    expect(syncRunComplete([true, true, false, true, true], 0)).toBe(false);
  });

  it('does not advance a page cursor after a budget stop inside the page', () => {
    expect(pageFullyProcessed(100, 100)).toBe(true);
    expect(pageFullyProcessed(73, 100)).toBe(false);
  });

  it('skips an unchanged held deal even when historic property repair is still pending', () => {
    expect(shouldSkipUnchangedDeal({
      heldModifiedAt: '2026-08-20T10:00:00.000Z',
      remoteModifiedAt: '2026-08-20T10:00:00Z',
    })).toBe(true);
  });

  it('fully syncs new, modified, or unprovably unchanged deals', () => {
    expect(shouldSkipUnchangedDeal({
      heldModifiedAt: null,
      remoteModifiedAt: '2026-08-20T10:00:00Z',
    })).toBe(false);
    expect(shouldSkipUnchangedDeal({
      heldModifiedAt: '2026-08-20T10:00:00Z',
      remoteModifiedAt: null,
    })).toBe(false);
    expect(shouldSkipUnchangedDeal({
      heldModifiedAt: '2026-08-20T10:00:00Z',
      remoteModifiedAt: '2026-08-21T10:00:00Z',
    })).toBe(false);
  });

  it('requires a known remote total and respects the catch-up slack boundary', () => {
    expect(isDealCountCaughtUp(975, 1_000, 25)).toBe(true);
    expect(isDealCountCaughtUp(974, 1_000, 25)).toBe(false);
    expect(isDealCountCaughtUp(null, 1_000, 25)).toBe(false);
    expect(isDealCountCaughtUp(1_000, null, 25)).toBe(false);
  });

  it('reuses incremental verification only while the HubSpot total remains close', () => {
    const cursor = encodeVerifiedDealTotal(186_700);
    expect(cursor).toBe('verified-total:186700');
    expect(isVerifiedIncrementalTotalCurrent(cursor, 186_723, 25)).toBe(true);
    expect(isVerifiedIncrementalTotalCurrent(cursor, 186_726, 25)).toBe(false);
    expect(isVerifiedIncrementalTotalCurrent(null, 186_723, 25)).toBe(false);
    expect(isVerifiedIncrementalTotalCurrent('17364384361', 186_723, 25)).toBe(false);
  });
});
