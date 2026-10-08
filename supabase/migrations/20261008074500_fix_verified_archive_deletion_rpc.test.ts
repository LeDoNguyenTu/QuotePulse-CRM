import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(new URL('./20261008074500_fix_verified_archive_deletion_rpc.sql', import.meta.url), 'utf8');

describe('verified archive deletion RPC ambiguity fix', () => {
  it('fails closed unless it can qualify the archive progress update', () => {
    expect(sql).toContain("where archive_id = p_archive_id and table_name = v_table");
    expect(sql).toContain('where workspace_archive_tables.archive_id = p_archive_id and workspace_archive_tables.table_name = v_table');
    expect(sql).toContain('raise exception');
  });

  it('preserves service-role-only execution', () => {
    expect(sql).toMatch(/revoke all on function public\.delete_legacy_workspace_archive_batch[\s\S]+authenticated/);
    expect(sql).toMatch(/grant execute on function public\.delete_legacy_workspace_archive_batch[\s\S]+service_role/);
  });
});
