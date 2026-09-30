begin;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('89000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'activity-a@example.test', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('89000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'activity-b@example.test', '', '{}'::jsonb, '{}'::jsonb, now(), now());

do $$
declare
  workspace_a uuid;
  workspace_b uuid;
begin
  select id into workspace_a from public.workspaces where kind = 'sales_crm' and created_by = '89000000-0000-0000-0000-000000000001';
  select id into workspace_b from public.workspaces where kind = 'sales_crm' and created_by = '89000000-0000-0000-0000-000000000002';
  perform set_config('test.activity_workspace_a', workspace_a::text, true);

  insert into public.crm_companies (id, workspace_id, name, created_by, updated_by) values
    ('8a000000-0000-0000-0000-000000000001', workspace_a, 'Activity A Co', '89000000-0000-0000-0000-000000000001', '89000000-0000-0000-0000-000000000001'),
    ('8a000000-0000-0000-0000-000000000002', workspace_b, 'Activity B Co', '89000000-0000-0000-0000-000000000002', '89000000-0000-0000-0000-000000000002');
  insert into public.crm_source_imports (id, workspace_id, original_filename, source_metadata, imported_by, created_by) values
    ('8b000000-0000-0000-0000-000000000001', workspace_a, 'a.xlsx', '{"mapping":{"remarks":"Remarks"}}', '89000000-0000-0000-0000-000000000001', '89000000-0000-0000-0000-000000000001'),
    ('8b000000-0000-0000-0000-000000000002', workspace_b, 'b.xlsx', '{"mapping":{"remarks":"Remarks"}}', '89000000-0000-0000-0000-000000000002', '89000000-0000-0000-0000-000000000002');
  insert into public.crm_source_references (workspace_id, source_import_id, source_row_number, company_id, created_by) values
    (workspace_a, '8b000000-0000-0000-0000-000000000001', 2, '8a000000-0000-0000-0000-000000000001', '89000000-0000-0000-0000-000000000001'),
    (workspace_b, '8b000000-0000-0000-0000-000000000002', 2, '8a000000-0000-0000-0000-000000000002', '89000000-0000-0000-0000-000000000002');
end;
$$;

select set_config('request.jwt.claim.sub', '89000000-0000-0000-0000-000000000001', true);
set local role authenticated;

do $$
declare
  result jsonb;
  workspace_a uuid := current_setting('test.activity_workspace_a')::uuid;
begin
  result := public.crm_add_activity_with_destination(
    workspace_a, 'company', '8a000000-0000-0000-0000-000000000001', 'note', 'Valid export note', now(),
    false, false, null, null, null, null,
    '8b000000-0000-0000-0000-000000000001', 2, 'Remarks'
  );
  if result->'activity'->>'source_column' <> 'Remarks' then raise exception 'valid destination was not saved'; end if;

  begin
    perform public.crm_add_activity_with_destination(
      workspace_a, 'company', '8a000000-0000-0000-0000-000000000001', 'note', 'Cross source', now(),
      false, false, null, null, null, null,
      '8b000000-0000-0000-0000-000000000002', 2, 'Remarks'
    );
    raise exception 'cross-workspace destination unexpectedly succeeded';
  exception when insufficient_privilege then null; end;

  begin
    perform public.crm_add_activity_with_destination(
      workspace_a, 'company', '8a000000-0000-0000-0000-000000000001', 'note', 'Wrong column', now(),
      false, false, null, null, null, null,
      '8b000000-0000-0000-0000-000000000001', 2, 'Unknown'
    );
    raise exception 'unmapped destination unexpectedly succeeded';
  exception when invalid_parameter_value then null; end;
end;
$$;

reset role;
rollback;
