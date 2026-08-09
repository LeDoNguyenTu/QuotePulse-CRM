/**
 * Convert HubSpot date properties into values PostgreSQL can safely cast to
 * timestamptz. HubSpot can return an empty string for an unset date, and older
 * properties may be represented as epoch milliseconds.
 */
export function nullableHubspotTimestamp(value: unknown): string | null {
  if (value == null) return null;

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^\d{10,}$/.test(trimmed)) {
    const date = new Date(Number(trimmed));
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  return Number.isNaN(Date.parse(trimmed)) ? null : trimmed;
}

