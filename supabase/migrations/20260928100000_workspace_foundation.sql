-- Workspace foundation for the legacy QuotePulse application and the new Sales CRM.
-- Legacy business rows remain owner_id scoped; new Sales CRM tables will reference
-- these workspaces in later migrations.

create schema if not exists private;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  kind text not null check (kind in ('legacy', 'sales_crm')),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (created_by, kind)
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index workspace_members_user_workspace_idx
  on public.workspace_members (user_id, workspace_id);

create table public.workspace_archives (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  archive_version integer not null check (archive_version > 0),
  schema_version text not null check (length(btrim(schema_version)) > 0),
  status text not null default 'building'
    check (status in ('building', 'verified', 'failed', 'deletion_eligible', 'deleted')),
  manifest_key text,
  manifest_sha256 text,
  table_counts jsonb not null default '{}'::jsonb
    check (jsonb_typeof(table_counts) = 'object'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  deleted_at timestamptz,
  check (
    status not in ('verified', 'deletion_eligible', 'deleted')
    or (manifest_key is not null and manifest_sha256 is not null and verified_at is not null)
  )
);

create index workspace_archives_workspace_created_idx
  on public.workspace_archives (workspace_id, created_at desc);

drop trigger if exists trg_workspaces_updated_at on public.workspaces;
create trigger trg_workspaces_updated_at
before update on public.workspaces
for each row execute function public.set_updated_at();

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_archives enable row level security;

revoke all on table public.workspaces from anon, authenticated;
revoke all on table public.workspace_members from anon, authenticated;
revoke all on table public.workspace_archives from anon, authenticated;

grant select on table public.workspaces to authenticated;
grant select on table public.workspace_members to authenticated;
grant select on table public.workspace_archives to authenticated;

grant all on table public.workspaces to service_role;
grant all on table public.workspace_members to service_role;
grant all on table public.workspace_archives to service_role;

create policy workspace_members_select_own
on public.workspace_members
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy workspaces_select_member
on public.workspaces
for select
to authenticated
using (
  exists (
    select 1
    from public.workspace_members member
    where member.workspace_id = workspaces.id
      and member.user_id = (select auth.uid())
  )
);

create policy workspace_archives_select_member
on public.workspace_archives
for select
to authenticated
using (
  exists (
    select 1
    from public.workspace_members member
    where member.workspace_id = workspace_archives.workspace_id
      and member.user_id = (select auth.uid())
  )
);

create or replace function private.ensure_default_workspaces(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  legacy_workspace_id uuid;
  sales_workspace_id uuid;
begin
  if p_user_id is null then
    raise exception 'A user ID is required to provision workspaces';
  end if;

  insert into public.workspaces (name, kind, created_by)
  values ('QuotePulse Legacy', 'legacy', p_user_id)
  on conflict (created_by, kind) do update
    set name = excluded.name
  returning id into legacy_workspace_id;

  insert into public.workspaces (name, kind, created_by)
  values ('Sales CRM', 'sales_crm', p_user_id)
  on conflict (created_by, kind) do update
    set name = excluded.name
  returning id into sales_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values
    (legacy_workspace_id, p_user_id, 'owner'),
    (sales_workspace_id, p_user_id, 'owner')
  on conflict (workspace_id, user_id) do nothing;
end;
$$;

revoke all on function private.ensure_default_workspaces(uuid) from public, anon, authenticated;
grant execute on function private.ensure_default_workspaces(uuid) to service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    execute 'grant execute on function private.ensure_default_workspaces(uuid) to supabase_auth_admin';
  end if;
end;
$$;

do $$
declare
  user_record record;
begin
  for user_record in select id from auth.users
  loop
    perform private.ensure_default_workspaces(user_record.id);
  end loop;
end;
$$;

create or replace function private.handle_new_user_workspaces()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.ensure_default_workspaces(new.id);
  return new;
end;
$$;

revoke all on function private.handle_new_user_workspaces() from public, anon, authenticated;

drop trigger if exists on_auth_user_create_workspaces on auth.users;
create trigger on_auth_user_create_workspaces
after insert on auth.users
for each row execute function private.handle_new_user_workspaces();
