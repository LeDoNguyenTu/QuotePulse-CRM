export function canAdvanceIncrementalWatermark(failedObjects: number): boolean {
  return failedObjects === 0;
}

export function pageFullyProcessed(processedObjects: number, pageObjects: number): boolean {
  return processedObjects === pageObjects;
}
