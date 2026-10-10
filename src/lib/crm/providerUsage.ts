export type UsageLevel = 'unknown' | 'normal' | 'warning' | 'critical' | 'exhausted';
export type UsageSource = 'provider_reported' | 'crm_tracked';

export interface TrackedUsageCard {
  source: UsageSource;
  used: number;
  limit: number | null;
  resetAt: string | null;
}

export interface BrevoStatusCard {
  source: 'provider_reported';
  status: 'healthy' | 'unhealthy' | 'unknown' | 'not_configured';
  message?: string;
  errorCode?: string;
  credits: Array<{ type?: string; credits?: number; creditsType?: string }>;
  rateLimit: { limit: number; remaining: number; resetSeconds: number } | null;
}

export interface ProviderStatusResult {
  checkedAt: string;
  delivery: { queued: number; failed: number; oldestQueuedAt: string | null };
  brevo: BrevoStatusCard;
  microsoft: TrackedUsageCard;
  serper: TrackedUsageCard;
  nvidia: TrackedUsageCard;
}

export function usageLevel(used: number | null, limit: number | null): UsageLevel {
  if (used === null || limit === null || limit <= 0) return 'unknown';
  const ratio = used / limit;
  if (ratio >= 1) return 'exhausted';
  if (ratio >= .95) return 'critical';
  if (ratio >= .8) return 'warning';
  return 'normal';
}

export function brevoQueueBlockReason(status: { status: string; checkedAt: string; message?: string }, now = Date.now()): string | null {
  const age = now - new Date(status.checkedAt).getTime();
  if (status.status !== 'unhealthy' || !Number.isFinite(age) || age < 0 || age > 5 * 60_000) return null;
  return status.message || 'Brevo is currently unavailable. Run the connection check in Operations or Settings.';
}
