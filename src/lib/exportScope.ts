export type ExportScope =
  | { mode: 'all' }
  | { mode: 'hubspot_activity_range'; from: string; to: string };

export function validateExportScope(scope: ExportScope): { error: string | null } {
  if (scope.mode === 'all') return { error: null };
  if (!scope.from || !scope.to) return { error: 'Choose both a start and end date.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(scope.from) || !/^\d{4}-\d{2}-\d{2}$/.test(scope.to)) return { error: 'Choose valid dates.' };
  if (scope.from > scope.to) return { error: 'The end date must not be before the start date.' };
  return { error: null };
}

export function exportDateRange(scope: ExportScope): { from: string; toExclusive: string } | null {
  if (scope.mode !== 'hubspot_activity_range' || validateExportScope(scope).error) return null;
  const end = new Date(`${scope.to}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  return { from: `${scope.from}T00:00:00.000Z`, toExclusive: end.toISOString() };
}
