export function canAdvanceIncrementalWatermark(failedObjects: number): boolean {
  return failedObjects === 0;
}

export function pageFullyProcessed(processedObjects: number, pageObjects: number): boolean {
  return processedObjects === pageObjects;
}

export function shouldSkipUnchangedDeal(input: {
  heldModifiedAt: string | null;
  remoteModifiedAt: string | null;
}): boolean {
  if (!input.heldModifiedAt || !input.remoteModifiedAt) return false;
  return Date.parse(input.heldModifiedAt) === Date.parse(input.remoteModifiedAt);
}

export function isDealCountCaughtUp(
  imported: number | null,
  remoteTotal: number | null,
  slack: number,
): boolean {
  if (imported == null || remoteTotal == null) return false;
  return imported >= remoteTotal - slack;
}

const VERIFIED_TOTAL_PREFIX = 'verified-total:';

export function encodeVerifiedDealTotal(total: number | null): string | null {
  if (total == null || !Number.isSafeInteger(total) || total < 0) return null;
  return `${VERIFIED_TOTAL_PREFIX}${total}`;
}

export function decodeVerifiedDealTotal(cursor: string | null): number | null {
  if (!cursor?.startsWith(VERIFIED_TOTAL_PREFIX)) return null;
  const total = Number(cursor.slice(VERIFIED_TOTAL_PREFIX.length));
  return Number.isSafeInteger(total) && total >= 0 ? total : null;
}

export function isVerifiedIncrementalTotalCurrent(
  cursor: string | null,
  remoteTotal: number | null,
  slack: number,
): boolean {
  const verifiedTotal = decodeVerifiedDealTotal(cursor);
  if (verifiedTotal == null || remoteTotal == null) return false;
  return remoteTotal <= verifiedTotal + slack;
}
