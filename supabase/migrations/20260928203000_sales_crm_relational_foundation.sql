-- Sales CRM relational foundation. These tables are intentionally separate
-- from the owner-scoped legacy HubSpot tables.

create extension if not exists pg_trgm with schema extensions;

create table public.crm_companies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 200),
  industry text,
  website text,
  domain text,
  phone text,
  address_line_1 text,
  address_line_2 text,
  city text,
  state_region text,
  postal_code text,
  country text,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  updated_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id)
);

create table public.crm_contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  company_id uuid,
  first_name text,
  last_name text,
  full_name text,
  email text,
  phone text,
  job_title text,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  updated_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, company_id)
    references public.crm_companies (workspace_id, id) on delete set null (company_id),
  check (
    nullif(btrim(coalesce(full_name, '')), '') is not null
    or nullif(btrim(coalesce(first_name, '')), '') is not null
    or nullif(btrim(coalesce(last_name, '')), '') is not null
    or nullif(btrim(coalesce(email, '')), '') is not null
  )
);

create table public.crm_deals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  company_id uuid,
  name text not null check (length(btrim(name)) between 1 and 240),
  stage text not null default 'new' check (length(btrim(stage)) between 1 and 80),
  amount numeric(15,2) check (amount is null or amount >= 0),
  currency text not null default 'SGD' check (currency ~ '^[A-Z]{3}$'),
  owner_user_id uuid,
  status text not null default 'open' check (status in ('open', 'won', 'lost', 'on_hold')),
  last_call_at timestamptz,
  follow_up_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  updated_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, company_id)
    references public.crm_companies (workspace_id, id) on delete set null (company_id),
  foreign key (workspace_id, owner_user_id)
    references public.workspace_members (workspace_id, user_id) on delete set null (owner_user_id)
);

create table public.crm_deal_contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  deal_id uuid not null,
  contact_id uuid not null,
  role text,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (workspace_id, deal_id, contact_id),
  foreign key (workspace_id, deal_id)
    references public.crm_deals (workspace_id, id) on delete cascade,
  foreign key (workspace_id, contact_id)
    references public.crm_contacts (workspace_id, id) on delete cascade
);

create table public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  company_id uuid,
  deal_id uuid,
  contact_id uuid,
  kind text not null check (kind in ('note', 'call', 'task_event')),
  body text not null check (length(btrim(body)) between 1 and 20000),
  occurred_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, company_id)
    references public.crm_companies (workspace_id, id) on delete cascade,
  foreign key (workspace_id, deal_id)
    references public.crm_deals (workspace_id, id) on delete cascade,
  foreign key (workspace_id, contact_id)
    references public.crm_contacts (workspace_id, id) on delete cascade,
  check (num_nonnulls(company_id, deal_id, contact_id) >= 1)
);

create table public.crm_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  company_id uuid,
  deal_id uuid,
  contact_id uuid,
  title text not null check (length(btrim(title)) between 1 and 240),
  description text,
  due_at timestamptz,
  reminder_at timestamptz,
  status text not null default 'open' check (status in ('open', 'in_progress', 'completed', 'cancelled')),
  assignee_id uuid,
  completed_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  updated_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, company_id)
    references public.crm_companies (workspace_id, id) on delete cascade,
  foreign key (workspace_id, deal_id)
    references public.crm_deals (workspace_id, id) on delete cascade,
  foreign key (workspace_id, contact_id)
    references public.crm_contacts (workspace_id, id) on delete cascade,
  foreign key (workspace_id, assignee_id)
    references public.workspace_members (workspace_id, user_id) on delete set null (assignee_id),
  check (status <> 'completed' or completed_at is not null)
);

create table public.crm_notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null,
  task_id uuid,
  kind text not null default 'task_reminder' check (kind in ('task_reminder')),
  status text not null default 'unread' check (status in ('unread', 'read', 'dismissed')),
  title text not null check (length(btrim(title)) between 1 and 240),
  body text,
  due_at timestamptz,
  read_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, task_id)
    references public.crm_tasks (workspace_id, id) on delete cascade,
  foreign key (workspace_id, user_id)
    references public.workspace_members (workspace_id, user_id) on delete cascade
);

create table public.crm_source_imports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  database_id text not null default (
    'CRM-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))
  ) check (database_id ~ '^CRM-[A-Z0-9]{12}$'),
  original_filename text not null check (length(btrim(original_filename)) between 1 and 500),
  sheet_name text,
  row_count integer not null default 0 check (row_count >= 0),
  checksum_sha256 text check (checksum_sha256 is null or checksum_sha256 ~ '^[a-f0-9]{64}$'),
  source_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(source_metadata) = 'object'),
  imported_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (workspace_id, database_id)
);

create table public.crm_source_references (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source_import_id uuid not null,
  source_row_number integer not null check (source_row_number > 0),
  company_id uuid,
  contact_id uuid,
  deal_id uuid,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, source_import_id)
    references public.crm_source_imports (workspace_id, id) on delete cascade,
  foreign key (workspace_id, company_id)
    references public.crm_companies (workspace_id, id) on delete cascade,
  foreign key (workspace_id, contact_id)
    references public.crm_contacts (workspace_id, id) on delete cascade,
  foreign key (workspace_id, deal_id)
    references public.crm_deals (workspace_id, id) on delete cascade,
  check (num_nonnulls(company_id, contact_id, deal_id) = 1)
);

create index crm_companies_workspace_name_idx
  on public.crm_companies (workspace_id, name, id);
create index crm_companies_name_search_idx
  on public.crm_companies using gin (name extensions.gin_trgm_ops);
create index crm_contacts_workspace_name_idx
  on public.crm_contacts (workspace_id, full_name, id);
create index crm_contacts_name_search_idx
  on public.crm_contacts using gin (full_name extensions.gin_trgm_ops);
create index crm_contacts_email_search_idx
  on public.crm_contacts using gin (email extensions.gin_trgm_ops);
create index crm_contacts_workspace_company_idx
  on public.crm_contacts (workspace_id, company_id);
create index crm_deals_workspace_created_idx
  on public.crm_deals (workspace_id, created_at desc, id);
create index crm_deals_name_search_idx
  on public.crm_deals using gin (name extensions.gin_trgm_ops);
create index crm_deals_workspace_company_idx
  on public.crm_deals (workspace_id, company_id);
create index crm_deal_contacts_contact_idx
  on public.crm_deal_contacts (workspace_id, contact_id, deal_id);
create index crm_activities_workspace_target_idx
  on public.crm_activities (workspace_id, deal_id, company_id, occurred_at desc);
create index crm_tasks_workspace_due_idx
  on public.crm_tasks (workspace_id, status, due_at, id);
create index crm_notifications_user_status_idx
  on public.crm_notifications (user_id, status, created_at desc);
create index crm_source_imports_workspace_created_idx
  on public.crm_source_imports (workspace_id, created_at desc);
create index crm_source_references_import_row_idx
  on public.crm_source_references (workspace_id, source_import_id, source_row_number);
create unique index crm_source_references_company_row_uidx
  on public.crm_source_references (workspace_id, source_import_id, source_row_number, company_id)
  where company_id is not null;
create unique index crm_source_references_contact_row_uidx
  on public.crm_source_references (workspace_id, source_import_id, source_row_number, contact_id)
  where contact_id is not null;
create unique index crm_source_references_deal_row_uidx
  on public.crm_source_references (workspace_id, source_import_id, source_row_number, deal_id)
  where deal_id is not null;

create or replace function private.crm_preserve_tenant_audit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.id := old.id;
  new.workspace_id := old.workspace_id;
  new.created_by := old.created_by;
  return new;
end;
$$;

revoke all on function private.crm_preserve_tenant_audit() from public, anon, authenticated;

create trigger crm_companies_preserve_tenant_audit before update on public.crm_companies
for each row execute function private.crm_preserve_tenant_audit();
create trigger crm_contacts_preserve_tenant_audit before update on public.crm_contacts
for each row execute function private.crm_preserve_tenant_audit();
create trigger crm_deals_preserve_tenant_audit before update on public.crm_deals
for each row execute function private.crm_preserve_tenant_audit();
create trigger crm_tasks_preserve_tenant_audit before update on public.crm_tasks
for each row execute function private.crm_preserve_tenant_audit();
create trigger crm_deal_contacts_preserve_tenant_audit before update on public.crm_deal_contacts
for each row execute function private.crm_preserve_tenant_audit();
create trigger crm_activities_preserve_tenant_audit before update on public.crm_activities
for each row execute function private.crm_preserve_tenant_audit();
create trigger crm_notifications_preserve_tenant_audit before update on public.crm_notifications
for each row execute function private.crm_preserve_tenant_audit();
create trigger crm_source_imports_preserve_tenant_audit before update on public.crm_source_imports
for each row execute function private.crm_preserve_tenant_audit();
create trigger crm_source_references_preserve_tenant_audit before update on public.crm_source_references
for each row execute function private.crm_preserve_tenant_audit();

create trigger crm_companies_updated_at before update on public.crm_companies
for each row execute function public.set_updated_at();
create trigger crm_contacts_updated_at before update on public.crm_contacts
for each row execute function public.set_updated_at();
create trigger crm_deals_updated_at before update on public.crm_deals
for each row execute function public.set_updated_at();
create trigger crm_tasks_updated_at before update on public.crm_tasks
for each row execute function public.set_updated_at();

alter table public.crm_companies enable row level security;
alter table public.crm_contacts enable row level security;
alter table public.crm_deals enable row level security;
alter table public.crm_deal_contacts enable row level security;
alter table public.crm_activities enable row level security;
alter table public.crm_tasks enable row level security;
alter table public.crm_notifications enable row level security;
alter table public.crm_source_imports enable row level security;
alter table public.crm_source_references enable row level security;

revoke all on table public.crm_companies from anon, authenticated;
revoke all on table public.crm_contacts from anon, authenticated;
revoke all on table public.crm_deals from anon, authenticated;
revoke all on table public.crm_deal_contacts from anon, authenticated;
revoke all on table public.crm_activities from anon, authenticated;
revoke all on table public.crm_tasks from anon, authenticated;
revoke all on table public.crm_notifications from anon, authenticated;
revoke all on table public.crm_source_imports from anon, authenticated;
revoke all on table public.crm_source_references from anon, authenticated;

grant select, insert, update, delete on table public.crm_companies to authenticated;
grant select, insert, update, delete on table public.crm_contacts to authenticated;
grant select, insert, update, delete on table public.crm_deals to authenticated;
grant select, insert, update, delete on table public.crm_deal_contacts to authenticated;
grant select, insert, update, delete on table public.crm_activities to authenticated;
grant select, insert, update, delete on table public.crm_tasks to authenticated;
grant select, insert, update, delete on table public.crm_notifications to authenticated;
grant select, insert, update, delete on table public.crm_source_imports to authenticated;
grant select, insert, update, delete on table public.crm_source_references to authenticated;

grant all on table public.crm_companies to service_role;
grant all on table public.crm_contacts to service_role;
grant all on table public.crm_deals to service_role;
grant all on table public.crm_deal_contacts to service_role;
grant all on table public.crm_activities to service_role;
grant all on table public.crm_tasks to service_role;
grant all on table public.crm_notifications to service_role;
grant all on table public.crm_source_imports to service_role;
grant all on table public.crm_source_references to service_role;

-- Each policy is written explicitly so grants and behavior remain auditable.
create policy crm_companies_select_member on public.crm_companies for select to authenticated
using (exists (select 1 from public.workspace_members m where m.workspace_id = crm_companies.workspace_id and m.user_id = (select auth.uid())));
create policy crm_companies_insert_member on public.crm_companies for insert to authenticated
with check (created_by = (select auth.uid()) and updated_by = (select auth.uid()) and exists (select 1 from public.workspace_members m where m.workspace_id = crm_companies.workspace_id and m.user_id = (select auth.uid())));
create policy crm_companies_update_member on public.crm_companies for update to authenticated
using (exists (select 1 from public.workspace_members m where m.workspace_id = crm_companies.workspace_id and m.user_id = (select auth.uid())))
with check (updated_by = (select auth.uid()) and exists (select 1 from public.workspace_members m where m.workspace_id = crm_companies.workspace_id and m.user_id = (select auth.uid())));
create policy crm_companies_delete_admin on public.crm_companies for delete to authenticated
using (exists (select 1 from public.workspace_members m where m.workspace_id = crm_companies.workspace_id and m.user_id = (select auth.uid()) and m.role in ('owner', 'admin')));

create policy crm_contacts_select_member on public.crm_contacts for select to authenticated
using (exists (select 1 from public.workspace_members m where m.workspace_id = crm_contacts.workspace_id and m.user_id = (select auth.uid())));
create policy crm_contacts_insert_member on public.crm_contacts for insert to authenticated
with check (created_by = (select auth.uid()) and updated_by = (select auth.uid()) and exists (select 1 from public.workspace_members m where m.workspace_id = crm_contacts.workspace_id and m.user_id = (select auth.uid())));
create policy crm_contacts_update_member on public.crm_contacts for update to authenticated
using (exists (select 1 from public.workspace_members m where m.workspace_id = crm_contacts.workspace_id and m.user_id = (select auth.uid())))
with check (updated_by = (select auth.uid()) and exists (select 1 from public.workspace_members m where m.workspace_id = crm_contacts.workspace_id and m.user_id = (select auth.uid())));
create policy crm_contacts_delete_admin on public.crm_contacts for delete to authenticated
using (exists (select 1 from public.workspace_members m where m.workspace_id = crm_contacts.workspace_id and m.user_id = (select auth.uid()) and m.role in ('owner', 'admin')));

create policy crm_deals_select_member on public.crm_deals for select to authenticated
using (exists (select 1 from public.workspace_members m where m.workspace_id = crm_deals.workspace_id and m.user_id = (select auth.uid())));
create policy crm_deals_insert_member on public.crm_deals for insert to authenticated
with check (created_by = (select auth.uid()) and updated_by = (select auth.uid()) and exists (select 1 from public.workspace_members m where m.workspace_id = crm_deals.workspace_id and m.user_id = (select auth.uid())));
create policy crm_deals_update_member on public.crm_deals for update to authenticated
using (exists (select 1 from public.workspace_members m where m.workspace_id = crm_deals.workspace_id and m.user_id = (select auth.uid())))
with check (updated_by = (select auth.uid()) and exists (select 1 from public.workspace_members m where m.workspace_id = crm_deals.workspace_id and m.user_id = (select auth.uid())));
create policy crm_deals_delete_admin on public.crm_deals for delete to authenticated
using (exists (select 1 from public.workspace_members m where m.workspace_id = crm_deals.workspace_id and m.user_id = (select auth.uid()) and m.role in ('owner', 'admin')));

create policy crm_deal_contacts_select_member on public.crm_deal_contacts for select to authenticated
using (exists (select 1 from public.workspace_members m where m.workspace_id = crm_deal_contacts.workspace_id and m.user_id = (select auth.uid())));
create policy crm_deal_contacts_insert_member on public.crm_deal_contacts for insert to authenticated
with check (created_by = (select auth.uid()) and exists (select 1 from public.workspace_members m where m.workspace_id = crm_deal_contacts.workspace_id and m.user_id = (select auth.uid())));
create policy crm_deal_contacts_update_member on public.crm_deal_contacts for update to authenticated
using (exists (select 1 from public.workspace_members m where m.workspace_id = crm_deal_contacts.workspace_id and m.user_id = (select auth.uid())))
with check (exists (select 1 from public.workspace_members m where m.workspace_id = crm_deal_contacts.workspace_id and m.user_id = (select auth.uid())));
create policy crm_deal_contacts_delete_admin on public.crm_deal_contacts for delete to authenticated
using (exists (select 1 from public.workspace_members m where m.workspace_id = crm_deal_contacts.workspace_id and m.user_id = (select auth.uid()) and m.role in ('owner', 'admin')));

create policy crm_activities_select_member on public.crm_activities for select to authenticated
using (exists (select 1 from public.workspace_members m where m.workspace_id = crm_activities.workspace_id and m.user_id = (select auth.uid())));
create policy crm_activities_insert_member on public.crm_activities for insert to authenticated
with check (created_by = (select auth.uid()) and exists (select 1 from public.workspace_members m where m.workspace_id = crm_activities.workspace_id and m.user_id = (select auth.uid())));
create policy crm_activities_update_member on public.crm_activities for update to authenticated
using (exists (select 1 from public.workspace_members m where m.workspace_id = crm_activities.workspace_id and m.user_id = (select auth.uid())))
with check (exists (select 1 from public.workspace_members m where m.workspace_id = crm_activities.workspace_id and m.user_id = (select auth.uid())));
create policy crm_activities_delete_admin on public.crm_activities for delete to authenticated
using (exists (select 1 from public.workspace_members m where m.workspace_id = crm_activities.workspace_id and m.user_id = (select auth.uid()) and m.role in ('owner', 'admin')));

create policy crm_tasks_select_member on public.crm_tasks for select to authenticated
using (exists (select 1 from public.workspace_members m where m.workspace_id = crm_tasks.workspace_id and m.user_id = (select auth.uid())));
create policy crm_tasks_insert_member on public.crm_tasks for insert to authenticated
with check (created_by = (select auth.uid()) and updated_by = (select auth.uid()) and exists (select 1 from public.workspace_members m where m.workspace_id = crm_tasks.workspace_id and m.user_id = (select auth.uid())));
create policy crm_tasks_update_member on public.crm_tasks for update to authenticated
using (exists (select 1 from public.workspace_members m where m.workspace_id = crm_tasks.workspace_id and m.user_id = (select auth.uid())))
with check (updated_by = (select auth.uid()) and exists (select 1 from public.workspace_members m where m.workspace_id = crm_tasks.workspace_id and m.user_id = (select auth.uid())));
create policy crm_tasks_delete_admin on public.crm_tasks for delete to authenticated
using (exists (select 1 from public.workspace_members m where m.workspace_id = crm_tasks.workspace_id and m.user_id = (select auth.uid()) and m.role in ('owner', 'admin')));

create policy crm_notifications_select_member on public.crm_notifications for select to authenticated
using (user_id = (select auth.uid()) and exists (select 1 from public.workspace_members m where m.workspace_id = crm_notifications.workspace_id and m.user_id = (select auth.uid())));
create policy crm_notifications_insert_member on public.crm_notifications for insert to authenticated
with check (user_id = (select auth.uid()) and created_by = (select auth.uid()) and exists (select 1 from public.workspace_members m where m.workspace_id = crm_notifications.workspace_id and m.user_id = (select auth.uid())));
create policy crm_notifications_update_member on public.crm_notifications for update to authenticated
using (user_id = (select auth.uid()) and exists (select 1 from public.workspace_members m where m.workspace_id = crm_notifications.workspace_id and m.user_id = (select auth.uid())))
with check (user_id = (select auth.uid()) and exists (select 1 from public.workspace_members m where m.workspace_id = crm_notifications.workspace_id and m.user_id = (select auth.uid())));
create policy crm_notifications_delete_admin on public.crm_notifications for delete to authenticated
using (exists (select 1 from public.workspace_members m where m.workspace_id = crm_notifications.workspace_id and m.user_id = (select auth.uid()) and m.role in ('owner', 'admin')));

create policy crm_source_imports_select_member on public.crm_source_imports for select to authenticated
using (exists (select 1 from public.workspace_members m where m.workspace_id = crm_source_imports.workspace_id and m.user_id = (select auth.uid())));
create policy crm_source_imports_insert_member on public.crm_source_imports for insert to authenticated
with check (imported_by = (select auth.uid()) and created_by = (select auth.uid()) and exists (select 1 from public.workspace_members m where m.workspace_id = crm_source_imports.workspace_id and m.user_id = (select auth.uid())));
create policy crm_source_imports_update_member on public.crm_source_imports for update to authenticated
using (exists (select 1 from public.workspace_members m where m.workspace_id = crm_source_imports.workspace_id and m.user_id = (select auth.uid())))
with check (exists (select 1 from public.workspace_members m where m.workspace_id = crm_source_imports.workspace_id and m.user_id = (select auth.uid())));
create policy crm_source_imports_delete_admin on public.crm_source_imports for delete to authenticated
using (exists (select 1 from public.workspace_members m where m.workspace_id = crm_source_imports.workspace_id and m.user_id = (select auth.uid()) and m.role in ('owner', 'admin')));

create policy crm_source_references_select_member on public.crm_source_references for select to authenticated
using (exists (select 1 from public.workspace_members m where m.workspace_id = crm_source_references.workspace_id and m.user_id = (select auth.uid())));
create policy crm_source_references_insert_member on public.crm_source_references for insert to authenticated
with check (created_by = (select auth.uid()) and exists (select 1 from public.workspace_members m where m.workspace_id = crm_source_references.workspace_id and m.user_id = (select auth.uid())));
create policy crm_source_references_update_member on public.crm_source_references for update to authenticated
using (exists (select 1 from public.workspace_members m where m.workspace_id = crm_source_references.workspace_id and m.user_id = (select auth.uid())))
with check (exists (select 1 from public.workspace_members m where m.workspace_id = crm_source_references.workspace_id and m.user_id = (select auth.uid())));
create policy crm_source_references_delete_admin on public.crm_source_references for delete to authenticated
using (exists (select 1 from public.workspace_members m where m.workspace_id = crm_source_references.workspace_id and m.user_id = (select auth.uid()) and m.role in ('owner', 'admin')));
