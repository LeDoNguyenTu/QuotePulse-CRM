import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  new URL('./20260827224615_resource_aware_storage_recovery.sql', import.meta.url),
  'utf8',
).toLowerCase();

describe('resource-aware automatic storage recovery migration', () => {
  it('installs the proactive capacity thresholds and one-owner cursor', () => {
    expect(sql).toContain('300000000');
    expect(sql).toContain('375000000');
    expect(sql).toContain('410000000');
    expect(sql).toContain('475000000');
    expect(sql).toContain('last_owner_id');
    expect(sql).toContain('last_archive_work_at');
    expect(sql).toContain('zero_candidate_observations');
    expect(sql).toMatch(/storage_archive_owner_candidates\(\)[\s\S]*limit 1/);
    expect(sql).toContain('complete_storage_archive_owner_attempt');
    expect(sql).toMatch(/pressure in \('warning', 'high', 'critical'\)/);
  });

  it('keeps the compaction state and controller private', () => {
    expect(sql).toContain('create table if not exists public.storage_compaction_state');
    expect(sql).toContain('alter table public.storage_compaction_state enable row level security');
    expect(sql).toMatch(/revoke all on table public\.storage_compaction_state from public, anon, authenticated/);
    expect(sql).toMatch(/create schema if not exists private/);
    expect(sql).toMatch(/revoke all on schema private from public, anon, authenticated/);
    expect(sql).toMatch(/create or replace function private\.reconcile_storage_compaction\(\)[\s\S]*set search_path = pg_catalog, public, extensions, cron, private/);
  });

  it('schedules only the fixed TOAST-only compaction command', () => {
    expect(sql).toContain('vacuum (');
    expect(sql).toContain('full,');
    expect(sql).toContain('skip_locked,');
    expect(sql).toContain('process_main false,');
    expect(sql).toContain('process_toast true');
    expect(sql).toContain(') public.deals;');
    expect(sql).not.toContain('vacuum full public.deals');
    expect(sql).not.toContain('process_main true');
  });

  it('uses quiet checks, a non-blocking lock, and bounded retry backoff', () => {
    expect(sql).toContain('pg_try_advisory_xact_lock');
    expect(sql).toContain('pg_stat_activity');
    expect(sql).toContain('pg_stat_progress_vacuum');
    expect(sql).toContain('pg_stat_progress_cluster');
    expect(sql).toContain("interval '15 minutes'");
    expect(sql).toContain("interval '30 minutes'");
    expect(sql).toContain("interval '60 minutes'");
    expect(sql).toContain("at time zone 'asia/singapore'");
    expect(sql).toContain("current_state.state in ('cooldown', 'retry_wait')");
  });

  it('prevents archive and compaction from acquiring work at the same time', () => {
    expect(sql).toMatch(/claim_storage_archive_lease[\s\S]*storage_compaction_state[\s\S]*state in \('scheduled', 'running'\)[\s\S]*return null/);
  });

  it('exposes only sanitized status and admission RPCs to the service role', () => {
    expect(sql).toContain('storage_compaction_status');
    expect(sql).toContain('storage_import_admission');
    expect(sql).toMatch(/revoke all on function public\.storage_compaction_status\(\)[\s\S]*from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.storage_compaction_status\(\)[\s\S]*to service_role/);
    expect(sql).toMatch(/revoke all on function public\.storage_import_admission\(uuid\)[\s\S]*from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.storage_import_admission\(uuid\)[\s\S]*to service_role/);
    expect(sql).toMatch(/recovery_state = 'failed_closed'[\s\S]*'capacity_guard'/);
  });

  it('reconciles each archive tick and creates the compaction job inactive', () => {
    expect(sql).toContain("cron.schedule('storage-pressure-r2-archive', '* * * * *'");
    expect(sql).toContain('private.reconcile_storage_compaction()');
    expect(sql).toMatch(/cron\.schedule\(\s*'storage-toast-compaction'/);
    expect(sql).toMatch(/cron\.alter_job\([\s\S]*active\s*:=\s*false/);
  });
});
