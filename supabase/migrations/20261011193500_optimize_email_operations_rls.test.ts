import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  new URL('./20261011193500_optimize_email_operations_rls.sql', import.meta.url),
  'utf8',
);

describe('email operations RLS optimization migration', () => {
  it('recreates both provider policies with init-plan auth lookups', () => {
    expect(sql).toMatch(/drop policy if exists provider_usage_member_select/i);
    expect(sql).toMatch(/drop policy if exists provider_budget_owner_all/i);
    expect(sql).toMatch(/owner_id = \(select auth\.uid\(\)\)/i);
    expect(sql).toMatch(/member\.user_id = \(select auth\.uid\(\)\)/i);
    expect(sql).not.toMatch(/= auth\.uid\(\)/i);
  });
});
