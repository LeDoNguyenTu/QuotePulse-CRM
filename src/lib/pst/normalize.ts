const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return EMAIL.test(normalized) ? normalized : null;
}
export function uniqueEmails(values: unknown[]): string[] {
  return [...new Set(values.map(normalizeEmail).filter((value): value is string => Boolean(value)))].sort();
}
