import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(new URL('./recover-supabase-storage.sql', import.meta.url), 'utf8').toLowerCase();

describe('guarded Supabase physical storage recovery', () => {
  it('fails fast unless logical archive and writer preflights pass', () => {
    expect(sql).toContain('\\set on_error_stop on');
    expect(sql).toMatch(/hubspot_properties, '\{\}'::jsonb\) <> '\{\}'::jsonb/);
    expect(sql).toContain('r2_archive_key is null');
    expect(sql).toContain('r2_archive_sha256 is null');
    expect(sql).toContain('r2_archived_at is null');
    expect(sql).toContain("default_transaction_read_only");
    expect(sql).toContain('pg_is_in_recovery()');
    expect(sql).toContain('pg_stat_activity');
    expect(sql).toContain('storage_archive_state');
    expect(sql).toContain('\\quit 3');
  });

  it('reports capacity and requires conservative temporary headroom', () => {
    expect(sql).toContain('pg_database_size(current_database())');
    expect(sql).toContain('pg_ls_waldir()');
    expect(sql).toContain("pg_total_relation_size('public.deals'::regclass)");
    expect(sql).toContain('pg_column_size(deal)');
    expect(sql).toContain('estimated_free_bytes');
    expect(sql).toContain('required_headroom_bytes');
  });

  it('keeps vacuum full outside a transaction and proves the final quota result', () => {
    expect(sql).not.toMatch(/begin;[\s\S]*vacuum \(full/);
    expect(sql).toContain('checkpoint;');
    expect(sql).toContain('vacuum (full, analyze) public.deals;');
    expect(sql).toContain('500000000');
    expect(sql).toContain('recovery succeeded');
  });
});
