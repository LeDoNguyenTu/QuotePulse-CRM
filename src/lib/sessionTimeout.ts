export const DEFAULT_SESSION_TIMEOUT_MINUTES = 120;
export const MIN_SESSION_TIMEOUT_MINUTES = 5;
export const MAX_SESSION_TIMEOUT_MINUTES = 7 * 24 * 60;

export function parseSessionTimeoutDraft(value: string): number | '' {
  return value === '' ? '' : Number(value);
}

export function normalizeSessionTimeoutMinutes(value: unknown): number {
  if (value === 0) return 0;
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < MIN_SESSION_TIMEOUT_MINUTES ||
    value > MAX_SESSION_TIMEOUT_MINUTES
  ) {
    return DEFAULT_SESSION_TIMEOUT_MINUTES;
  }
  return value;
}

/** `null` means the application's automatic idle sign-out is disabled. */
export function sessionTimeoutMs(minutes: unknown): number | null {
  const normalized = normalizeSessionTimeoutMinutes(minutes);
  return normalized === 0 ? null : normalized * 60 * 1000;
}
