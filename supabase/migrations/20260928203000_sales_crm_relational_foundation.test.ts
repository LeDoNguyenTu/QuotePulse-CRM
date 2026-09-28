import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL(
  './20260928203000_sales_crm_relational_foundation.sql',
  import.meta.url,
);

function migrationSql(): string {
  expect(existsSync(migrationUrl), 'Sales CRM migration must exist').toBe(true);
  return existsSync(migrationUrl) ? readFileSync(migrationUrl, 'utf8').toLowerCase() : '';
}

const crmTables = [
  'crm_companies',
  'crm_contacts',
  'crm_deals',
  'crm_deal_contacts',
  'crm_activities',
  'crm_tasks',
  'crm_notifications',
  'crm_source_imports',
  'crm_source_references',
] as const;

describe('Sales CRM relational foundation migration', () => {
  it('creates the isolated CRM table set', () => {
    const sql = migrationSql();

    for (const table of crmTables) {
      expect(sql).toContain(`create table public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    }
  });

  it('uses explicit Data API grants and operation-specific membership policies', () => {
    const sql = migrationSql();

    for (const table of crmTables) {
      expect(sql).toContain(`revoke all on table public.${table} from anon, authenticated`);
      expect(sql).toContain(`grant select, insert, update, delete on table public.${table} to authenticated`);
      expect(sql).toMatch(new RegExp(`create policy ${table}_select_member[\\s\\S]+?on public\\.${table}[\\s\\S]+?for select[\\s\\S]+?to authenticated`));
      expect(sql).toMatch(new RegExp(`create policy ${table}_insert_member[\\s\\S]+?on public\\.${table}[\\s\\S]+?for insert[\\s\\S]+?to authenticated`));
      expect(sql).toMatch(new RegExp(`create policy ${table}_update_member[\\s\\S]+?on public\\.${table}[\\s\\S]+?for update[\\s\\S]+?to authenticated`));
      expect(sql).toMatch(new RegExp(`create policy ${table}_delete_admin[\\s\\S]+?on public\\.${table}[\\s\\S]+?for delete[\\s\\S]+?to authenticated`));
    }
  });

  it('prevents cross-workspace associations with composite foreign keys', () => {
    const sql = migrationSql();

    expect(sql).toContain('unique (workspace_id, id)');
    expect(sql).toContain('foreign key (workspace_id, company_id)');
    expect(sql).toContain('references public.crm_companies (workspace_id, id)');
    expect(sql).toContain('references public.crm_companies (workspace_id, id) on delete set null (company_id)');
    expect(sql).toContain('foreign key (workspace_id, deal_id)');
    expect(sql).toContain('references public.crm_deals (workspace_id, id)');
    expect(sql).toContain('foreign key (workspace_id, contact_id)');
    expect(sql).toContain('references public.crm_contacts (workspace_id, id)');
    expect(sql).toContain('references public.workspace_members (workspace_id, user_id)');
    expect(sql).toContain('on delete set null (owner_user_id)');
    expect(sql).toContain('on delete set null (assignee_id)');
    expect(sql.match(/execute function private\.crm_preserve_tenant_audit\(\)/g)).toHaveLength(9);
  });

  it('adds focused pagination, association, reminder, and search indexes', () => {
    const sql = migrationSql();

    expect(sql).toContain('create extension if not exists pg_trgm with schema extensions');
    expect(sql).toContain('crm_companies_workspace_name_idx');
    expect(sql).toContain('crm_contacts_workspace_name_idx');
    expect(sql).toContain('crm_deals_workspace_created_idx');
    expect(sql).toContain('crm_tasks_workspace_due_idx');
    expect(sql).toContain('crm_notifications_user_status_idx');
    expect(sql).toContain('crm_source_references_company_row_uidx');
    expect(sql).toContain('crm_source_references_contact_row_uidx');
    expect(sql).toContain('crm_source_references_deal_row_uidx');
    expect(sql).toContain('gin_trgm_ops');
  });

  it('keeps legacy business tables out of the migration', () => {
    const sql = migrationSql();

    expect(sql).not.toMatch(/alter table public\.(companies|contacts|deals)\s/);
    expect(sql).not.toMatch(/update public\.(companies|contacts|deals)\s/);
  });
});
