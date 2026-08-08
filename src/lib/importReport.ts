export type ImportReportStatus = 'idle' | 'running' | 'paused' | 'complete' | 'failed';

/** A slice can return done:false while the import runner immediately starts the next slice. */
export function shouldShowImportReport(status: ImportReportStatus | undefined, hasReport: boolean): boolean {
  return hasReport && status !== 'running';
}
