import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { rateLimitFromHeaders, recordProviderUsage } from '../supabase/functions/_shared/providerTelemetry';

const migration = readFileSync(new URL('../supabase/migrations/20261011120000_email_delivery_operations.sql', import.meta.url), 'utf8');
const statusSource = readFileSync(new URL('../supabase/functions/provider-status/index.ts', import.meta.url), 'utf8');
const queueSource = readFileSync(new URL('../supabase/functions/process-email-queue/index.ts', import.meta.url), 'utf8');
const quoteSource = readFileSync(new URL('../supabase/functions/parse-quote/index.ts', import.meta.url), 'utf8');
const deployWorkflow = readFileSync(new URL('../.github/workflows/supabase.yml', import.meta.url), 'utf8');
const databaseTest = readFileSync(new URL('../supabase/tests/email_delivery_operations.sql', import.meta.url), 'utf8');

describe('provider telemetry', () => {
  it('parses provider rate windows and treats missing values as unknown', () => {
    expect(rateLimitFromHeaders(new Headers({ 'x-sib-ratelimit-limit': '100', 'x-sib-ratelimit-remaining': '12', 'x-sib-ratelimit-reset': '30' })))
      .toEqual({ limit: 100, remaining: 12, resetSeconds: 30 });
    expect(rateLimitFromHeaders(new Headers())).toBeNull();
  });

  it('never throws when telemetry persistence fails', async () => {
    const insert = vi.fn().mockResolvedValue({ error: new Error('metrics unavailable') });
    const admin = { from: vi.fn(() => ({ insert })) } as never;
    await expect(recordProviderUsage(admin, { ownerId: 'owner', workspaceId: 'workspace', provider: 'brevo', operation: 'email_send', units: 1, succeeded: true })).resolves.toBeUndefined();
  });

  it('defines workspace RLS, budgets, and explicit service-role scoping', () => {
    expect(migration).toMatch(/create table public\.provider_usage_events/i);
    expect(migration).toMatch(/create table public\.provider_budget_settings/i);
    expect(migration).toMatch(/workspace_members[\s\S]+auth\.uid\(\)/i);
    expect(statusSource).toMatch(/\.eq\('workspace_id', workspaceId\)/);
    expect(statusSource).toMatch(/\.eq\('owner_id', userId\)/);
    expect(queueSource).toMatch(/recordProviderUsage[\s\S]+workspaceId: row\.workspace_id[\s\S]+ownerId/i);
    expect(quoteSource).toMatch(/recordProviderUsage[\s\S]+workspaceId: null[\s\S]+provider: 'nvidia'/i);
  });

  it('deploys the provider status function through the production workflow', () => {
    expect(deployWorkflow).toMatch(/for fn in[^\n]*\bprovider-status\b/);
    expect(deployWorkflow).toContain('supabase/tests/email_delivery_operations.sql');
    expect(databaseTest).toContain('historical attempt states were not preserved');
    expect(databaseTest).toContain('retrying a non-current historical failure unexpectedly succeeded');
  });

  it('uses exact delivery counts, owner-global Microsoft usage, paged telemetry, a cache, and recent failures', () => {
    expect(statusSource).toMatch(/count: 'exact', head: true/);
    expect(statusSource).toMatch(/oldestQueued/i);
    expect(statusSource).toMatch(/recentFailures/i);
    expect(statusSource).toMatch(/provider_status_cache/i);
    expect(statusSource).toMatch(/credentialFingerprint/i);
    expect(statusSource).toMatch(/credential_fingerprint/);
    expect(statusSource).toMatch(/loadUsageEvents/i);
    expect(statusSource).not.toMatch(/\.limit\(1000\)/);
    expect(statusSource).toMatch(/eq\('created_by', userId\)\.eq\('status', 'sent'\)/);
    expect(statusSource).not.toMatch(/email_sends'[\s\S]{0,180}eq\('workspace_id', workspaceId\)[\s\S]{0,180}eq\('status', 'sent'\)/);
  });

  it('stores the exact provider payload and durable attempt timestamps before submission', () => {
    expect(queueSource).toMatch(/recordAttemptPayload[\s\S]+await sendWithProvider/);
    expect(queueSource).toMatch(/attempted_at/);
    expect(queueSource).toMatch(/failed_at/);
    expect(queueSource).toMatch(/blocked_at/);
    expect(queueSource).toMatch(/from '\.\.\/_shared\/emailContent\.ts'/);
  });
});
