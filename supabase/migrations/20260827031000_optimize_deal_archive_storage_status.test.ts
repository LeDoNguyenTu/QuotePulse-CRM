import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  new URL('./20260827031000_optimize_deal_archive_storage_status.sql', import.meta.url),
  'utf8',
).toLowerCase();

describe('deal archive recovery status optimization', () => {
  it('counts pending snapshots through the matching partial-index predicate', () => {
    expect(sql).toContain('deal_archive_storage_status');
    expect(sql).toMatch(/deal\.owner_id\s*=\s*p_owner_id/);
    expect(sql).toContain('deal.r2_archive_key is null');
    expect(sql).toContain('deal.hubspot_properties is not null');
    expect(sql).toContain("deal.hubspot_properties <> '{}'::jsonb");
    expect(sql).not.toMatch(/count\(\*\)\s+filter/);
    expect(sql).not.toContain('deal.r2_archive_key is not null');
  });

  it('preserves the service-role-only RPC boundary', () => {
    expect(sql).toContain('security invoker');
    expect(sql).toMatch(/revoke all on function public\.deal_archive_storage_status[\s\S]*from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.deal_archive_storage_status[\s\S]*to service_role/);
  });
});
