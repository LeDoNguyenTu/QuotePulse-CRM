export function remainingArchiveBudget(limit: number, dealsAttempted: number): number {
  const boundedLimit = Math.max(0, Math.floor(Number.isFinite(limit) ? limit : 0));
  const attempted = Math.max(0, Math.floor(Number.isFinite(dealsAttempted) ? dealsAttempted : 0));
  return Math.max(0, boundedLimit - attempted);
}
