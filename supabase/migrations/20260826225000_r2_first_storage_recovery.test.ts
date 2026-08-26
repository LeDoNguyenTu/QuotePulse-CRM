import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  new URL('./20260826225000_r2_first_storage_recovery.sql', import.meta.url),
  'utf8',
).toLowerCase();

describe('R2-first storage recovery migration', () => {
  it('finalizes repaired deal batches with owner-safe timestamp compare-and-set semantics', () => {
    expect(sql).toContain('finalize_hubspot_deal_property_archive_batch');
    expect(sql).toContain('security invoker');
    expect(sql).toMatch(/deal\.owner_id\s*=\s*p_owner_id/);
    expect(sql).toMatch(/deal\.id\s*=\s*incoming\.id/);
    expect(sql).toMatch(/deal\.hubspot_deal_id\s*=\s*incoming\.hubspot_deal_id/);
    expect(sql).toMatch(/deal\.hubspot_modified_at\s+is\s+not\s+distinct\s+from\s+incoming\.expected_modified_at/);
    expect(sql).toContain("hubspot_properties = '{}'::jsonb");
    expect(sql).toContain('p_schema_version is null');
    expect(sql).toContain('p_r2_key is null');
    expect(sql).toContain('p_r2_sha256 is null');
  });

  it('exposes the finalizer only to the service role', () => {
    expect(sql).toMatch(/revoke all on function public\.finalize_hubspot_deal_property_archive_batch[\s\S]*from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.finalize_hubspot_deal_property_archive_batch[\s\S]*to service_role/);
  });

  it('runs critical-pressure checks every minute and bounds cron telemetry', () => {
    expect(sql).toContain("cron.schedule('storage-pressure-r2-archive', '* * * * *'");
    expect(sql).toContain('truncate table cron.job_run_details');
    expect(sql).toContain("cron.schedule('prune-cron-job-history'");
    expect(sql).toMatch(/delete from cron\.job_run_details[\s\S]*interval '7 days'/);
  });

  it('reports owner-filtered logical archive status only to the service role', () => {
    expect(sql).toContain('deal_archive_storage_status');
    expect(sql).toMatch(/where deal\.owner_id\s*=\s*p_owner_id/);
    expect(sql).toMatch(/count\(\*\) filter \(\s*where[\s\S]*hubspot_properties, '\{\}'::jsonb\) <> '\{\}'::jsonb/);
    expect(sql).toMatch(/revoke all on function public\.deal_archive_storage_status[\s\S]*from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.deal_archive_storage_status[\s\S]*to service_role/);
  });
});
