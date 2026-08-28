import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  new URL('./20260827224615_resource_aware_storage_recovery.sql', import.meta.url),
  'utf8',
).toLowerCase();
const workflow = readFileSync(
  new URL('../../.github/workflows/supabase.yml', import.meta.url),
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
    expect(sql).toMatch(/last_archive_work_at[\s\S]*max\(run\.finished_at\)[\s\S]*statement_timestamp\(\)/);
  });

  it('keeps the compaction state and controller private', () => {
    expect(sql).toContain('create table if not exists public.storage_compaction_state');
    expect(sql).toContain('alter table public.storage_compaction_state enable row level security');
    expect(sql).toMatch(/revoke all on table public\.storage_compaction_state from public, anon, authenticated/);
    expect(sql).toMatch(/create schema if not exists private/);
    expect(sql).toMatch(/revoke all on schema private from public, anon, authenticated/);
    expect(sql).toMatch(/create or replace function private\.reconcile_storage_compaction\(\)[\s\S]*set search_path = pg_catalog, public, extensions, cron, private/);
    expect(sql).toContain('controller_enabled boolean not null default false');
    expect(workflow).toMatch(/deploy edge functions[\s\S]*controller_enabled = true/);
  });

  it('schedules only the fixed TOAST-only compaction command', () => {
    expect(sql).toContain('vacuum (');
    expect(sql).toContain('full,');
    expect(sql).not.toContain('skip_locked');
    expect(sql).toContain('process_main false,');
    expect(sql).toContain('process_toast true');
    expect(sql).toContain(') public.deals;');
    expect(sql).not.toContain('vacuum full public.deals');
    expect(sql).not.toContain('process_main true');
    expect(sql).toMatch(/set lock_timeout = %l[\s\S]*'5s'/);
    expect(sql).toContain('reset lock_timeout');
    expect(sql).toMatch(/set_storage_compaction_lock_timeout[\s\S]*cron\.alter_job/);
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
    expect(sql).toContain("skip_reason = 'toast-compaction-ineffective'");
    expect(sql).toMatch(/deal_toast_bytes_before[\s\S]*sizes\.deal_toast_bytes[\s\S]*storage_compaction_backoff/);
    expect(sql).toContain("skip_reason in ('cron-stop-verification', 'controller-uncertain')");
    expect(sql).toMatch(/state = 'running'[\s\S]*skip_reason = 'controller-uncertain'/);
    expect(sql).toContain('reltoastrelid');
    expect(sql).toMatch(/pg_stat_progress_vacuum[\s\S]*deal_toast_oid/);
  });

  it('prevents archive and compaction from acquiring work at the same time', () => {
    expect(sql).toMatch(/claim_storage_archive_lease[\s\S]*storage_compaction_state[\s\S]*state in \('scheduled', 'running'\)[\s\S]*return null/);
  });

  it('records productive archive writes transactionally with finalization', () => {
    expect(sql).toMatch(/finalize_deal_archive_batch[\s\S]*last_archive_work_at = statement_timestamp\(\)/);
    expect(sql).toMatch(/finalize_company_attachment_archive_batch[\s\S]*last_archive_work_at = statement_timestamp\(\)/);
    expect(sql).toMatch(/if archived > 0[\s\S]*zero_candidate_observations = 0/);
    expect(sql).toMatch(/if removed > 0[\s\S]*zero_candidate_observations = 0/);
  });

  it('prevents imports from overlapping archive or compaction acquisition', () => {
    expect(sql).toContain('create table if not exists public.storage_import_state');
    expect(sql).toMatch(/claim_storage_archive_lease[\s\S]*storage_import_state[\s\S]*lease_expires_at/);
    expect(sql).toMatch(/reconcile_storage_compaction[\s\S]*storage_import_state[\s\S]*import-lease-active/);
  });

  it('exposes only sanitized status and admission RPCs to the service role', () => {
    expect(sql).toContain('storage_compaction_status');
    expect(sql).toContain('claim_storage_import_admission');
    expect(sql).toContain('release_storage_import_lease');
    expect(sql).toMatch(/revoke all on function public\.storage_compaction_status\(\)[\s\S]*from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.storage_compaction_status\(\)[\s\S]*to service_role/);
    expect(sql).toMatch(/revoke all on function public\.claim_storage_import_admission\(uuid, integer\)[\s\S]*from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.claim_storage_import_admission\(uuid, integer\)[\s\S]*to service_role/);
    expect(sql).toMatch(/recovery_state\.state = 'failed_closed'[\s\S]*'capacity_guard'/);
    expect(sql).toMatch(/claim_storage_import_admission[\s\S]*storage_archive_owner_candidates\(\)/);
    expect(sql).toMatch(/claim_storage_import_admission[\s\S]*for update[\s\S]*lease_token/);
    expect(sql).toMatch(/make_interval\(secs => greatest\(300, least\(p_lease_seconds, 300\)\)\)/);
    expect(sql).not.toMatch(/storage_compaction_status\(\)[\s\S]*left\(recovery\.last_error/);
  });

  it('reconciles each archive tick and creates the compaction job inactive', () => {
    expect(sql).toContain("cron.schedule('storage-pressure-r2-archive', '* * * * *'");
    expect(sql).toContain('private.reconcile_storage_compaction()');
    expect(sql).toMatch(/cron\.schedule\(\s*'storage-toast-compaction'/);
    expect(sql).toMatch(/cron\.alter_job\([\s\S]*active\s*:=\s*false/);
  });
});
