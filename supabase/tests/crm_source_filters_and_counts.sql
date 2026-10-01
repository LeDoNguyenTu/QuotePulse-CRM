begin;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('86000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'source-a@example.test', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('86000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'source-b@example.test', '', '{}'::jsonb, '{}'::jsonb, now(), now());

do $$
declare
  workspace_a uuid;
  workspace_b uuid;
begin
  select id into workspace_a from public.workspaces where kind = 'sales_crm' and created_by = '86000000-0000-0000-0000-000000000001';
  select id into workspace_b from public.workspaces where kind = 'sales_crm' and created_by = '86000000-0000-0000-0000-000000000002';
  perform set_config('test.source_workspace_a', workspace_a::text, true);

  insert into public.crm_companies (id, workspace_id, name, created_by, updated_by) values
    ('87000000-0000-0000-0000-000000000001', workspace_a, 'Workspace A Source Co', '86000000-0000-0000-0000-000000000001', '86000000-0000-0000-0000-000000000001'),
    ('87000000-0000-0000-0000-000000000002', workspace_b, 'Workspace B Source Co', '86000000-0000-0000-0000-000000000002', '86000000-0000-0000-0000-000000000002');
  insert into public.crm_source_imports (id, workspace_id, original_filename, imported_by, created_by) values
    ('88000000-0000-0000-0000-000000000001', workspace_a, 'a.xlsx', '86000000-0000-0000-0000-000000000001', '86000000-0000-0000-0000-000000000001'),
    ('88000000-0000-0000-0000-000000000002', workspace_b, 'b.xlsx', '86000000-0000-0000-0000-000000000002', '86000000-0000-0000-0000-000000000002');
  insert into public.crm_source_references (workspace_id, source_import_id, source_row_number, company_id, created_by) values
    (workspace_a, '88000000-0000-0000-0000-000000000001', 2, '87000000-0000-0000-0000-000000000001', '86000000-0000-0000-0000-000000000001'),
    (workspace_b, '88000000-0000-0000-0000-000000000002', 2, '87000000-0000-0000-0000-000000000002', '86000000-0000-0000-0000-000000000002');
end;
$$;

select set_config('request.jwt.claim.sub', '86000000-0000-0000-0000-000000000001', true);
set local role authenticated;

do $$
declare
  visible_count integer;
begin
  select count(*) into visible_count
  from public.crm_list_companies(
    current_setting('test.source_workspace_a')::uuid,
    '88000000-0000-0000-0000-000000000002'::uuid
  );
  if visible_count <> 0 then
    raise exception 'cross-workspace source filter exposed % rows', visible_count;
  end if;

  select count(*) into visible_count
  from public.crm_list_companies(
    current_setting('test.source_workspace_a')::uuid,
    '88000000-0000-0000-0000-000000000001'::uuid
  );
  if visible_count <> 1 then
    raise exception 'same-workspace source filter returned % rows', visible_count;
  end if;
end;
$$;

reset role;
rollback;
