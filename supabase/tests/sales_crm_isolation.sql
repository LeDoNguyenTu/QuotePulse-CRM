begin;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '82000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'crm-owner-a@example.test', '',
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '82000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'crm-owner-b@example.test', '',
    '{}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into public.crm_companies (
  id, workspace_id, name, created_by, updated_by
)
select
  '83000000-0000-0000-0000-000000000002',
  workspace.id,
  'Workspace B Company',
  workspace.created_by,
  workspace.created_by
from public.workspaces workspace
where workspace.kind = 'sales_crm'
  and workspace.created_by = '82000000-0000-0000-0000-000000000002';

select set_config('test.workspace_b', workspace.id::text, true)
from public.workspaces workspace
where workspace.kind = 'sales_crm'
  and workspace.created_by = '82000000-0000-0000-0000-000000000002';

select set_config('request.jwt.claim.sub', '82000000-0000-0000-0000-000000000001', true);
set local role authenticated;

insert into public.crm_companies (id, workspace_id, name, industry)
select
  '83000000-0000-0000-0000-000000000001',
  workspace.id,
  'Workspace A Company',
  'Technology'
from public.workspaces workspace
where workspace.kind = 'sales_crm';

do $$
declare
  visible_count integer;
  changed_count integer;
  workspace_a uuid;
begin
  select count(*) into visible_count from public.crm_companies;
  if visible_count <> 1 then
    raise exception 'CRM company RLS leaked or hid rows: %', visible_count;
  end if;

  update public.crm_companies
  set name = 'Workspace A Company Updated',
      updated_by = (select auth.uid())
  where id = '83000000-0000-0000-0000-000000000001';
  get diagnostics changed_count = row_count;
  if changed_count <> 1 then
    raise exception 'workspace member could not update own CRM row';
  end if;

  select id into workspace_a
  from public.workspaces
  where kind = 'sales_crm';

  begin
    insert into public.crm_contacts (
      workspace_id, company_id, full_name
    ) values (
      workspace_a,
      '83000000-0000-0000-0000-000000000002',
      'Cross Workspace Contact'
    );
    raise exception 'cross-workspace company association unexpectedly succeeded';
  exception
    when foreign_key_violation then null;
  end;

  begin
    insert into public.crm_companies (workspace_id, name)
    values (current_setting('test.workspace_b')::uuid, 'Unauthorized Company');
    raise exception 'cross-workspace insert unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  delete from public.crm_companies
  where id = '83000000-0000-0000-0000-000000000001';
  get diagnostics changed_count = row_count;
  if changed_count <> 1 then
    raise exception 'workspace owner could not delete own CRM row';
  end if;

  if has_table_privilege('anon', 'public.crm_companies', 'select') then
    raise exception 'anonymous role can read CRM tables';
  end if;
end;
$$;

reset role;
rollback;
