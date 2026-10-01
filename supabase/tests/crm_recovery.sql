begin;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('8e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'recovery-a@example.test', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('8e000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'recovery-b@example.test', '', '{}'::jsonb, '{}'::jsonb, now(), now());

set local role service_role;

do $$
declare
  workspace_a uuid;
begin
  select id into workspace_a
  from public.workspaces
  where kind = 'sales_crm' and created_by = '8e000000-0000-0000-0000-000000000001';

  perform set_config('test.recovery_workspace_a', workspace_a::text, true);

  insert into public.crm_companies (id, workspace_id, name, created_by, updated_by) values
    ('8f000000-0000-0000-0000-000000000001', workspace_a, 'Exclusive Company', '8e000000-0000-0000-0000-000000000001', '8e000000-0000-0000-0000-000000000001'),
    ('8f000000-0000-0000-0000-000000000002', workspace_a, 'Shared Company', '8e000000-0000-0000-0000-000000000001', '8e000000-0000-0000-0000-000000000001');

  insert into public.crm_source_imports (id, workspace_id, original_filename, imported_by, created_by) values
    ('90000000-0000-0000-0000-000000000001', workspace_a, 'delete-me.xlsx', '8e000000-0000-0000-0000-000000000001', '8e000000-0000-0000-0000-000000000001'),
    ('90000000-0000-0000-0000-000000000002', workspace_a, 'keep-me.xlsx', '8e000000-0000-0000-0000-000000000001', '8e000000-0000-0000-0000-000000000001');

  insert into public.crm_source_references (workspace_id, source_import_id, source_row_number, company_id, created_by) values
    (workspace_a, '90000000-0000-0000-0000-000000000001', 1, '8f000000-0000-0000-0000-000000000001', '8e000000-0000-0000-0000-000000000001'),
    (workspace_a, '90000000-0000-0000-0000-000000000001', 2, '8f000000-0000-0000-0000-000000000002', '8e000000-0000-0000-0000-000000000001'),
    (workspace_a, '90000000-0000-0000-0000-000000000002', 1, '8f000000-0000-0000-0000-000000000002', '8e000000-0000-0000-0000-000000000001');

  insert into public.crm_recovery_manifests (
    id, workspace_id, target_kind, target_id, label, state,
    archive_r2_key, archive_sha256, created_by
  ) values (
    '91000000-0000-0000-0000-000000000001', workspace_a, 'workbook',
    '90000000-0000-0000-0000-000000000001', 'delete-me.xlsx', 'verified',
    format('owners/%s/workspaces/%s/crm-recovery/%s/snapshot.v1.json.gz', '8e000000-0000-0000-0000-000000000001', workspace_a, '91000000-0000-0000-0000-000000000001'),
    repeat('a', 64), '8e000000-0000-0000-0000-000000000001'
  );
end;
$$;

do $$
begin
  begin
    perform public.crm_apply_recovery_delete(
      '91000000-0000-0000-0000-000000000001',
      '8e000000-0000-0000-0000-000000000002'
    );
    raise exception 'cross-workspace actor unexpectedly deleted recovery data';
  exception when insufficient_privilege then null;
  end;

  perform public.crm_apply_recovery_delete(
    '91000000-0000-0000-0000-000000000001',
    '8e000000-0000-0000-0000-000000000001'
  );

  if exists (select 1 from public.crm_companies where id = '8f000000-0000-0000-0000-000000000001') then
    raise exception 'exclusive company was not deleted';
  end if;
  if not exists (select 1 from public.crm_companies where id = '8f000000-0000-0000-0000-000000000002') then
    raise exception 'shared company was deleted';
  end if;
  if exists (select 1 from public.crm_source_imports where id = '90000000-0000-0000-0000-000000000001') then
    raise exception 'deleted source import remains';
  end if;
  if not exists (select 1 from public.crm_source_imports where id = '90000000-0000-0000-0000-000000000002') then
    raise exception 'unrelated source import was deleted';
  end if;
  if (select expires_at - created_at from public.crm_recovery_manifests where id = '91000000-0000-0000-0000-000000000001') <> interval '30 days' then
    raise exception 'recovery manifest does not expire in 30 days';
  end if;
end;
$$;

reset role;
rollback;
