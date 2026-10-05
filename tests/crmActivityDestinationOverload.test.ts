import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationDirectory = new URL('../supabase/migrations/', import.meta.url);
const migrationSql = readdirSync(migrationDirectory)
  .filter((name) => name.endsWith('.sql'))
  .map((name) => readFileSync(new URL(name, migrationDirectory), 'utf8'));

describe('CRM activity destination function upgrade', () => {
  it('replaces the overloaded wrapper with one complete callable signature', () => {
    const remediation = migrationSql.find((sql) => /drop function if exists public\.crm_add_activity_with_destination\(uuid, text, uuid, text, text, timestamptz, boolean, boolean, text, timestamptz, timestamptz, uuid, uuid, integer, text\)/i.test(sql));

    expect(remediation).toBeDefined();
    expect(remediation).toMatch(/create or replace function public\.crm_add_activity_with_destination\([\s\S]+p_call_outcome text default null[\s\S]+v_result := public\.crm_add_activity_with_task\(/i);
    expect(remediation).toMatch(/set source_import_id = p_source_import_id,[\s\S]+call_outcome = case when p_kind = 'call'/i);
    expect(remediation).not.toMatch(/v_result := public\.crm_add_activity_with_destination\(/i);
  });
});
