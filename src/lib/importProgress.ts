import type { ImportProgress } from './functions';

export function liveImportPercent(
  total: number | null,
  imported: number,
  phase: ImportProgress['phase'] | null | undefined,
): number | null {
  if (phase === 'properties') return 100;
  if (total == null || !Number.isFinite(total) || total <= 0) return null;
  const ratio = Number.isFinite(imported) ? imported / total : 0;
  return Math.max(0, Math.min(99, Math.round(ratio * 100)));
}

export function recentDealsPerSecond(
  previousImported: number,
  currentImported: number,
  previousCompletedAt: number,
  currentCompletedAt: number
): number | null {
  const values = [previousImported, currentImported, previousCompletedAt, currentCompletedAt];
  if (!values.every(Number.isFinite)) return null;

  const importedDelta = currentImported - previousImported;
  const elapsedSeconds = (currentCompletedAt - previousCompletedAt) / 1_000;
  if (importedDelta <= 0 || elapsedSeconds <= 0) return null;

  const rate = importedDelta / elapsedSeconds;
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

export function recentImportEtaMinutes(
  remaining: number | null,
  dealsPerSecond: number | null | undefined,
  phase: ImportProgress['phase'] | null | undefined
): number | null {
  if (
    phase === 'properties' || remaining == null || remaining <= 0 ||
    dealsPerSecond == null || !Number.isFinite(dealsPerSecond) || dealsPerSecond <= 0
  ) {
    return null;
  }

  return Math.max(1, Math.ceil(remaining / dealsPerSecond / 60));
}

export function importActivityText(secondsSinceResponse: number): string {
  const seconds = Number.isFinite(secondsSinceResponse)
    ? Math.max(0, Math.floor(secondsSinceResponse))
    : 0;
  if (seconds >= 60) {
    return 'This step is taking longer than usual - still waiting for the server';
  }
  return `Working - last server response ${seconds}s ago`;
}

export function importResponseTimestamp(
  lastStepAt: number | undefined,
  startedAt: number
): number {
  return Number.isFinite(lastStepAt) ? lastStepAt as number : startedAt;
}
