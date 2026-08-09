export type ImportReportStatus = 'idle' | 'running' | 'paused' | 'complete' | 'failed';

/** A slice can return done:false while the import runner immediately starts the next slice. */
export function shouldShowImportReport(status: ImportReportStatus | undefined, hasReport: boolean): boolean {
  return hasReport && status !== 'running';
}

/** A live ratio may be unreliable while archived records are still syncing. */
export function importCompletionPercent(done: boolean): 100 | null {
  return done ? 100 : null;
}
