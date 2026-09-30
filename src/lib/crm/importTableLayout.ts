export const IMPORT_PREVIEW_PAGE_SIZE = 15;
export const IMPORT_HISTORY_PAGE_SIZE = 15;

const AUTO_MIN_WIDTH = 128;
const AUTO_MAX_WIDTH = 480;
const MANUAL_MIN_WIDTH = 96;
const MANUAL_MAX_WIDTH = 640;
const SAMPLE_ROWS = 100;

export function paginateImportRows<T>(rows: T[], page: number, pageSize = IMPORT_PREVIEW_PAGE_SIZE): T[] {
  const normalizedPage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const start = (normalizedPage - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

function longestLineLength(value: unknown): number {
  return String(value ?? '').split(/\r?\n/).reduce((longest, line) => Math.max(longest, line.trim().length), 0);
}

export function autoFitImportColumnWidths(
  headers: string[],
  rows: Record<string, unknown>[],
): Record<string, number> {
  const sample = rows.slice(0, SAMPLE_ROWS);
  return Object.fromEntries(headers.map((header) => {
    const contentLength = sample.reduce(
      (longest, row) => Math.max(longest, longestLineLength(row[header])),
      header.length,
    );
    return [header, clamp(48 + contentLength * 7, AUTO_MIN_WIDTH, AUTO_MAX_WIDTH)];
  }));
}

export function mergeImportColumnWidths(
  headers: string[],
  automatic: Record<string, number>,
  saved: Record<string, number>,
): Record<string, number> {
  return Object.fromEntries(headers.map((header) => {
    const manual = saved[header];
    return [header, Number.isFinite(manual)
      ? clamp(manual, MANUAL_MIN_WIDTH, MANUAL_MAX_WIDTH)
      : automatic[header] ?? AUTO_MIN_WIDTH];
  }));
}

export function parseImportColumnWidths(value: string | null): Record<string, number> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).flatMap(([header, width]) =>
      typeof width === 'number' && Number.isFinite(width) ? [[header, width]] : [],
    ));
  } catch {
    return {};
  }
}

export function importColumnWidthStorageKey(workspaceId: string): string {
  return `quotepulse:crm-import-column-widths:${workspaceId}`;
}
