export interface CrmSourceFilter {
  id: string;
  databaseId: string;
  filename: string;
  type: 'workbook' | 'pst';
  headers?: string[];
  rowIndexAvailable?: boolean;
}

export function toggleSourceFilter(
  current: CrmSourceFilter | null,
  source: CrmSourceFilter,
): CrmSourceFilter | null {
  return current?.id === source.id ? null : source;
}

export function clearSourceFilter(_current: CrmSourceFilter | null): null {
  return null;
}

const SOURCE_COLUMN_PREFIX = 'source-column:';

export function sourceColumnId(header: string): string {
  return `${SOURCE_COLUMN_PREFIX}${encodeURIComponent(header)}`;
}

export function sourceHeaderFromColumnId(columnId: string): string | null {
  if (!columnId.startsWith(SOURCE_COLUMN_PREFIX)) return null;
  try {
    return decodeURIComponent(columnId.slice(SOURCE_COLUMN_PREFIX.length));
  } catch {
    return null;
  }
}
