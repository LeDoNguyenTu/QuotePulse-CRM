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
  imported: number,
  remoteTotal: number | null,
  slack: number,
): boolean {
  if (remoteTotal == null) return false;
  return imported >= remoteTotal - slack;
}
