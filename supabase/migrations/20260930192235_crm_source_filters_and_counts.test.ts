import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('./20260930192235_crm_source_filters_and_counts.sql', import.meta.url), 'utf8');

describe('CRM source filters and counts migration', () => {
  it('adds security-invoker list RPCs with explicit membership checks', () => {
    for (const resource of ['companies', 'contacts', 'deals']) {
      expect(sql).toContain(`crm_list_${resource}`);
    }
    expect(sql.match(/security invoker/gi)?.length).toBeGreaterThanOrEqual(3);
    expect(sql.match(/workspace_members/gi)?.length).toBeGreaterThanOrEqual(3);
  });

  it('contains source filters, aggregate counts, and authenticated-only grants', () => {
    expect(sql).toContain('p_source_import_id');
    expect(sql).toContain('source_count');
    expect(sql).toContain('task_count');
    expect(sql).toContain('deal_count');
    expect(sql).toMatch(/revoke all on function[\s\S]+from public, anon/i);
    expect(sql).toMatch(/grant execute on function[\s\S]+to authenticated/i);
  });
});
