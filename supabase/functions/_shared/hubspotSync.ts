export function canAdvanceIncrementalWatermark(failedObjects: number): boolean {
  return failedObjects === 0;
}

export function pageFullyProcessed(processedObjects: number, pageObjects: number): boolean {
  return processedObjects === pageObjects;
}

export interface IncrementalSyncCursor {
  watermark: string;
  startedAt: string;
  after: string | null;
  needsReconciliation?: boolean;
}

const INCREMENTAL_CURSOR_PREFIX = 'incremental-page:';

function validTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

export function encodeIncrementalSyncCursor(cursor: IncrementalSyncCursor): string {
  return `${INCREMENTAL_CURSOR_PREFIX}${encodeURIComponent(JSON.stringify(cursor))}`;
}

export function decodeIncrementalSyncCursor(cursor: string | null): IncrementalSyncCursor | null {
  if (!cursor?.startsWith(INCREMENTAL_CURSOR_PREFIX)) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(cursor.slice(INCREMENTAL_CURSOR_PREFIX.length))) as
      Partial<IncrementalSyncCursor>;
    if (
      !validTimestamp(parsed.watermark)
      || !validTimestamp(parsed.startedAt)
      || (parsed.after !== null && typeof parsed.after !== 'string')
    ) return null;
    return {
      watermark: parsed.watermark,
      startedAt: parsed.startedAt,
      after: parsed.after,
      ...(parsed.needsReconciliation === true ? { needsReconciliation: true } : {}),
    };
  } catch {
    return null;
  }
}

export function resumeIncrementalSyncCursor(
  encoded: string | null,
  watermark: string,
  startedAt: string,
): IncrementalSyncCursor {
  const saved = decodeIncrementalSyncCursor(encoded);
  if (saved?.watermark === watermark) return saved;
  return { watermark, startedAt, after: null };
}

export function incrementalSearchStartCursors(savedAfter: string | null): Array<string | undefined> {
  return savedAfter ? [undefined, savedAfter] : [undefined];
}

export function incrementalSearchNeedsReconciliation(
  after: string | null | undefined,
  resultLimit = 10_000,
): boolean {
  if (after == null) return false;
  const offset = Number(after);
  return Number.isFinite(offset) && offset >= resultLimit;
}

export function incrementalWatermarkWithOverlap(
  previousWatermark: string,
  cycleStartedAt: string,
  overlapMs: number,
): string {
  const previous = Date.parse(previousWatermark);
  const cycleStart = Date.parse(cycleStartedAt);
  if (!Number.isFinite(previous) || !Number.isFinite(cycleStart)) return previousWatermark;
  return new Date(Math.max(previous, cycleStart - Math.max(0, overlapMs))).toISOString();
}

export function fullReconciliationDue(
  lastCompletedAt: string | null,
  nowMs: number,
  intervalMs: number,
): boolean {
  if (!lastCompletedAt) return true;
  const completedAt = Date.parse(lastCompletedAt);
  return !Number.isFinite(completedAt) || nowMs - completedAt >= intervalMs;
}

export function syncRunComplete(stages: boolean[], pendingDealRetries: number | null): boolean {
  return pendingDealRetries === 0 && stages.every(Boolean);
}

export function backfillStartCursor(
  phase: 'backfill' | 'incremental',
  cursor: string | null,
): string | undefined {
  return phase === 'backfill' ? cursor ?? undefined : undefined;
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
