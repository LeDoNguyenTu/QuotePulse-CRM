begin;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '8c000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'provenance@example.test', '', '{}'::jsonb, '{}'::jsonb, now(), now()
);

select set_config('request.jwt.claim.sub', '8c000000-0000-0000-0000-000000000001', true);
set local role authenticated;

do $$
declare
  v_workspace_id uuid;
  v_company_id uuid;
  source_value text;
begin
  select id into v_workspace_id from public.workspaces
  where kind = 'sales_crm' and created_by = '8c000000-0000-0000-0000-000000000001';

  insert into public.crm_companies (
    workspace_id, name, industry, field_sources, created_by, updated_by
  ) values (
    v_workspace_id, 'Provenance Company', 'Construction',
    '{"name":"workbook","industry":"workbook"}'::jsonb,
    '8c000000-0000-0000-0000-000000000001', '8c000000-0000-0000-0000-000000000001'
  ) returning id into v_company_id;

  update public.crm_companies set industry = 'Engineering'
  where workspace_id = v_workspace_id and id = v_company_id;
  select field_sources->>'industry' into source_value from public.crm_companies where id = v_company_id;
  if source_value <> 'user' then raise exception 'manual edit provenance was not marked user'; end if;

  begin
    update public.crm_companies set field_sources = '{"industry":"invented"}'::jsonb where id = v_company_id;
    raise exception 'invalid provenance unexpectedly succeeded';
  exception when check_violation then null; end;
end;
$$;

reset role;
rollback;
