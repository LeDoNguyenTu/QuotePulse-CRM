begin;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '81000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'workspace-owner-a@example.test', '',
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '81000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'workspace-owner-b@example.test', '',
    '{}'::jsonb, '{}'::jsonb, now(), now()
  );

select private.ensure_default_workspaces('81000000-0000-0000-0000-000000000001');
select private.ensure_default_workspaces('81000000-0000-0000-0000-000000000001');

insert into public.workspace_archives (
  workspace_id, archive_version, schema_version, status, created_by
)
select workspace.id, 1, 'workspace-foundation-test', 'building', workspace.created_by
from public.workspaces workspace
where workspace.kind = 'legacy'
  and workspace.created_by in (
    '81000000-0000-0000-0000-000000000001',
    '81000000-0000-0000-0000-000000000002'
  );

do $$
declare
  workspace_count integer;
  membership_count integer;
begin
  select count(*) into workspace_count
  from public.workspaces
  where created_by = '81000000-0000-0000-0000-000000000001';

  select count(*) into membership_count
  from public.workspace_members member
  join public.workspaces workspace on workspace.id = member.workspace_id
  where workspace.created_by = '81000000-0000-0000-0000-000000000001'
    and member.user_id = '81000000-0000-0000-0000-000000000001'
    and member.role = 'owner';

  if workspace_count <> 2 or membership_count <> 2 then
    raise exception 'workspace provisioning is not idempotent: %, %', workspace_count, membership_count;
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000001', true);
set local role authenticated;

do $$
declare
  visible_workspaces integer;
  visible_memberships integer;
  visible_archives integer;
begin
  select count(*) into visible_workspaces from public.workspaces;
  select count(*) into visible_memberships from public.workspace_members;
  select count(*) into visible_archives from public.workspace_archives;

  if visible_workspaces <> 2 or visible_memberships <> 2 or visible_archives <> 1 then
    raise exception 'workspace RLS leaked or hid rows: %, %, %',
      visible_workspaces, visible_memberships, visible_archives;
  end if;

  if has_table_privilege('authenticated', 'public.workspaces', 'insert')
     or has_table_privilege('authenticated', 'public.workspace_members', 'update')
     or has_table_privilege('authenticated', 'public.workspace_archives', 'delete') then
    raise exception 'authenticated workspace metadata privileges are not read-only';
  end if;
end;
$$;

reset role;
rollback;
