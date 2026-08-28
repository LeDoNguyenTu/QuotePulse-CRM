import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  new URL('./20260828154834_allow_safe_capacity_hubspot_imports.sql', import.meta.url),
  'utf8',
).toLowerCase();

describe('resource-aware storage admission', () => {
  it('allows a background archive backlog while database capacity is safe', () => {
    expect(sql).toMatch(
      /claim_storage_import_admission[\s\S]*global_pending and used_bytes >= 410000000/,
    );
    expect(sql).toMatch(
      /global_pending boolean := false[\s\S]*used_bytes :=[\s\S]*if used_bytes >= 410000000 then[\s\S]*storage_archive_owner_candidates/,
    );
  });

  it('reconciles safe capacity before the legacy import-lease cooldown branch', () => {
    expect(sql).toMatch(
      /reconcile_storage_compaction_guarded[\s\S]*sizes\.database_bytes < 410000000[\s\S]*private\.reconcile_storage_compaction\(\)/,
    );
    expect(sql).toMatch(/cron\.alter_job[\s\S]*reconcile_storage_compaction_guarded/);
  });

  it('accepts an already-guarded cron command and fails closed on drift', () => {
    expect(sql).toMatch(
      /archive_job\.command like '%private\.reconcile_storage_compaction_guarded\(\)%'[\s\S]*then[\s\S]*null/,
    );
    expect(sql).toMatch(/else[\s\S]*raise exception 'storage recovery cron command is not recognized/);
  });

  it('preserves the fail-closed admission fences and fixed lease contract', () => {
    expect(sql).toMatch(/recovery_state\.state in \('scheduled', 'running', 'retry_wait'\)/);
    expect(sql).toMatch(/recovery_state\.state = 'failed_closed'[\s\S]*'capacity_guard'/);
    expect(sql).toMatch(/archive_state\.lease_expires_at[\s\S]*'archive-active'/);
    expect(sql).toMatch(/used_bytes >= 410000000[\s\S]*'capacity_guard'/);
    expect(sql).toMatch(/make_interval\(secs => greatest\(300, least\(p_lease_seconds, 300\)\)\)/);
    expect(sql).toMatch(
      /revoke all on function public\.claim_storage_import_admission\(uuid, integer\)[\s\S]*from public, anon, authenticated[\s\S]*grant execute[\s\S]*to service_role/,
    );
  });
});
