export interface ProviderRateLimit {
  limit: number;
  remaining: number;
  resetSeconds: number;
}

export interface ProviderUsageEvent {
  ownerId: string;
  workspaceId: string | null;
  provider: 'brevo' | 'microsoft_graph' | 'serper' | 'nvidia';
  operation: string;
  units: number;
  succeeded: boolean;
  errorCategory?: string | null;
  rateLimit?: ProviderRateLimit | null;
}

export function rateLimitFromHeaders(headers: Headers): ProviderRateLimit | null {
  const rawLimit = headers.get('x-sib-ratelimit-limit');
  const rawRemaining = headers.get('x-sib-ratelimit-remaining');
  const rawReset = headers.get('x-sib-ratelimit-reset');
  if (rawLimit === null || rawRemaining === null || rawReset === null) return null;
  const limit = Number(rawLimit);
  const remaining = Number(rawRemaining);
  const resetSeconds = Number(rawReset);
  return Number.isFinite(limit) && Number.isFinite(remaining) && Number.isFinite(resetSeconds)
    ? { limit, remaining, resetSeconds }
    : null;
}

export async function recordProviderUsage(admin: { from: (table: string) => { insert: (value: Record<string, unknown>) => PromiseLike<{ error?: unknown }> } }, event: ProviderUsageEvent): Promise<void> {
  try {
    const resetAt = event.rateLimit ? new Date(Date.now() + event.rateLimit.resetSeconds * 1_000).toISOString() : null;
    await admin.from('provider_usage_events').insert({
      owner_id: event.ownerId,
      workspace_id: event.workspaceId,
      provider: event.provider,
      operation: event.operation,
      units: Math.max(0, Math.trunc(event.units)),
      succeeded: event.succeeded,
      error_category: event.errorCategory ?? null,
      provider_limit: event.rateLimit?.limit ?? null,
      provider_remaining: event.rateLimit?.remaining ?? null,
      provider_reset_at: resetAt,
    });
  } catch {
    // Operational telemetry must never change the provider action's outcome.
  }
}
