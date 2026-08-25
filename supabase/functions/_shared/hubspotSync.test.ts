import { describe, expect, it } from 'vitest';
import {
  canAdvanceIncrementalWatermark,
  encodeVerifiedDealTotal,
  isDealCountCaughtUp,
  isVerifiedIncrementalTotalCurrent,
  pageFullyProcessed,
  shouldSkipUnchangedDeal,
} from './hubspotSync';

describe('HubSpot sync cursor guards', () => {
  it('does not advance an incremental watermark when any object failed', () => {
    expect(canAdvanceIncrementalWatermark(0)).toBe(true);
    expect(canAdvanceIncrementalWatermark(1)).toBe(false);
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
