import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL('./20260928100000_workspace_foundation.sql', import.meta.url);

describe('workspace foundation migration', () => {
  it('defines the workspace tables and indexed membership boundary', () => {
    expect(existsSync(migrationUrl), 'workspace migration must exist').toBe(true);
    if (!existsSync(migrationUrl)) return;

    const sql = readFileSync(migrationUrl, 'utf8').toLowerCase();
    expect(sql).toContain('create table public.workspaces');
    expect(sql).toContain('create table public.workspace_members');
    expect(sql).toContain('create table public.workspace_archives');
    expect(sql).toContain("kind in ('legacy', 'sales_crm')");
    expect(sql).toMatch(/create index workspace_members_user_workspace_idx\s+on public\.workspace_members \(user_id, workspace_id\)/);
  });

  it('keeps browser access read-only and enables RLS on every table', () => {
    expect(existsSync(migrationUrl), 'workspace migration must exist').toBe(true);
    if (!existsSync(migrationUrl)) return;

    const sql = readFileSync(migrationUrl, 'utf8').toLowerCase();
    for (const table of ['workspaces', 'workspace_members', 'workspace_archives']) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(`revoke all on table public.${table} from anon, authenticated`);
      expect(sql).toContain(`grant select on table public.${table} to authenticated`);
    }
    expect(sql).not.toMatch(/create policy[^;]+for (insert|update|delete|all)\s+to authenticated/s);
  });

  it('provisions existing and future users through a locked-down trigger helper', () => {
    expect(existsSync(migrationUrl), 'workspace migration must exist').toBe(true);
    if (!existsSync(migrationUrl)) return;

    const sql = readFileSync(migrationUrl, 'utf8').toLowerCase();
    expect(sql).toMatch(/security definer\s+set search_path = ''/);
    expect(sql).toContain('private.ensure_default_workspaces(user_record.id)');
    expect(sql).toContain('after insert on auth.users');
    expect(sql).toMatch(/revoke all on function private\.ensure_default_workspaces\(uuid\) from public, anon, authenticated/);
    expect(sql).toContain('on conflict (created_by, kind) do update');
    expect(sql).toContain('on conflict (workspace_id, user_id) do nothing');
  });
});
