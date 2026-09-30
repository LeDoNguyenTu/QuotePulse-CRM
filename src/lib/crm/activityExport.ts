import type { CrmSourceLineage } from './detailQueries';

export type ActivityDestination = {
  sourceImportId: string;
  sourceRowNumber: number;
  sourceColumn: string;
} | null;

export type ActivityDestinationOption = Exclude<ActivityDestination, null> & { label: string };

export interface WorkbookActivity {
  id: string;
  body: string;
  occurred_at: string | null;
}

const activityDateTime = new Intl.DateTimeFormat('en-SG', {
  timeZone: 'Asia/Singapore',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

export function combineWorkbookActivities(activities: WorkbookActivity[]): string {
  return [...activities]
    .sort((left, right) => {
      const leftTime = left.occurred_at ? new Date(left.occurred_at).getTime() : Number.NEGATIVE_INFINITY;
      const rightTime = right.occurred_at ? new Date(right.occurred_at).getTime() : Number.NEGATIVE_INFINITY;
      return rightTime - leftTime || left.id.localeCompare(right.id);
    })
    .map((activity) => {
      if (!activity.occurred_at) return activity.body;
      const date = new Date(activity.occurred_at);
      return Number.isNaN(date.getTime()) ? activity.body : `[${activityDateTime.format(date)}] ${activity.body}`;
    })
    .join('\n\n');
}

export function activityDestinationsFromLineage(lineage: CrmSourceLineage[]): ActivityDestinationOption[] {
  const roles = ['callLog', 'remarks', 'comments'] as const;
  return lineage.flatMap((item) => {
    const source = item.source_import;
    const mapping = source?.source_metadata?.mapping;
    if (!source?.id || !mapping || typeof mapping !== 'object' || Array.isArray(mapping)) return [];
    const mapped = mapping as Record<string, unknown>;
    return roles.flatMap((role) => {
      const column = typeof mapped[role] === 'string' ? mapped[role].trim() : '';
      return column ? [{
        sourceImportId: source.id!,
        sourceRowNumber: item.source_row_number,
        sourceColumn: column,
        label: `${source.original_filename} · Row ${item.source_row_number} · ${column}`,
      }] : [];
    });
  });
}
