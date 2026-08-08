export const DEFAULT_DAILY_SEND_LIMIT = 50;
export const DEFAULT_COOLDOWN_SECONDS = 60;
export const MIN_COOLDOWN_SECONDS = 30;

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isSuppressedEmail(email: string, suppressed: Set<string>) {
  return suppressed.has(normalizeEmail(email));
}

export function scheduleRecipients(start: Date, count: number, cooldownSeconds: number) {
  const interval = Math.max(MIN_COOLDOWN_SECONDS, Math.floor(cooldownSeconds)) * 1_000;
  return Array.from({ length: Math.max(0, count) }, (_, index) => new Date(start.getTime() + index * interval));
}

export interface ProviderFailureInput {
  status?: number;
  retryAfterSeconds?: number;
  ambiguous?: boolean;
}

export function classifyProviderFailure({ status, retryAfterSeconds, ambiguous }: ProviderFailureInput) {
  const retryable = !ambiguous && (status === 429 || (status != null && status >= 500 && status <= 599));
  return { retryable, ambiguous: Boolean(ambiguous), retryAfterSeconds };
}
