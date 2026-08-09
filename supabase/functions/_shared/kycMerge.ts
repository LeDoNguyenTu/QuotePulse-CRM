const MANUAL_FIELDS = [
  'website', 'linkedin', 'facebook', 'phone', 'industry', 'address', 'about',
  'contacts', 'other_links', 'sources', 'manual_override_updated_at',
] as const;

export function mergeKycEnrichment<T extends Record<string, unknown>>(
  existing: T | null | undefined,
  discovered: T,
  manuallyEdited: boolean
): T {
  if (!manuallyEdited || !existing) return discovered;
  const merged: Record<string, unknown> = { ...discovered };
  for (const field of MANUAL_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(existing, field)) merged[field] = existing[field];
  }
  return merged as T;
}
