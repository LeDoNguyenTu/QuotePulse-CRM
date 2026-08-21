begin;

do $$
declare
  dashboard_index text;
  lookup_definition text;
  unoptimized_policies integer;
begin
  if to_regprocedure('public.find_company_by_normalized_name(uuid,text)') is null then
    raise exception 'indexed normalized company lookup function is missing';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.find_company_by_normalized_name(uuid,text)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'public.find_company_by_normalized_name(uuid,text)',
    'execute'
  ) or has_function_privilege(
    'anon',
    'public.find_company_by_normalized_name(uuid,text)',
    'execute'
  ) then
    raise exception 'normalized company lookup privilege boundary is incorrect';
  end if;

  select pg_get_functiondef(
    'public.find_company_by_normalized_name(uuid,text)'::regprocedure
  ) into lookup_definition;

  if lookup_definition not ilike '%lower(company.name_clean) = lower(p_name)%' then
    raise exception 'normalized company lookup lost its indexable equality predicate';
  end if;

  select pg_get_indexdef(indexrelid)
  into dashboard_index
  from pg_stat_user_indexes
  where schemaname = 'public'
    and indexrelname = 'companies_owner_dashboard_order_idx';

  if dashboard_index is null
     or dashboard_index not ilike '%(owner_id, last_hubspot_modified_at desc nulls last, last_hubspot_created_at desc nulls last, id)%'
     or dashboard_index not ilike '%where (deleted_at is null)%' then
    raise exception 'dashboard ordering index does not match the active query: %', dashboard_index;
  end if;

  select count(*)
  into unoptimized_policies
  from pg_policies
  where schemaname = 'public'
    and (
      (coalesce(qual, '') ~ 'auth\.uid\(\)' and coalesce(qual, '') !~* 'select\s+auth\.uid\(\)')
      or
      (coalesce(with_check, '') ~ 'auth\.uid\(\)' and coalesce(with_check, '') !~* 'select\s+auth\.uid\(\)')
    );

  if unoptimized_policies <> 0 then
    raise exception '% public RLS policies still evaluate auth.uid() per row', unoptimized_policies;
  end if;
end;
$$;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '71000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'query-owner-a@example.test', '',
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '71000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'query-owner-b@example.test', '',
    '{}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into public.companies (id, owner_id, name_clean, name_raw)
values
  (
    '72000000-0000-0000-0000-000000000001',
    '71000000-0000-0000-0000-000000000001',
    'Indexed Company Match', 'Indexed Company Match'
  ),
  (
    '72000000-0000-0000-0000-000000000002',
    '71000000-0000-0000-0000-000000000002',
    'INDEXED COMPANY MATCH', 'INDEXED COMPANY MATCH'
  );

do $$
declare
  owner_a_match uuid;
  owner_b_match uuid;
begin
  select id into owner_a_match
  from public.find_company_by_normalized_name(
    '71000000-0000-0000-0000-000000000001',
    'INDEXED COMPANY MATCH'
  );

  select id into owner_b_match
  from public.find_company_by_normalized_name(
    '71000000-0000-0000-0000-000000000002',
    'indexed company match'
  );

  if owner_a_match is distinct from '72000000-0000-0000-0000-000000000001'::uuid
     or owner_b_match is distinct from '72000000-0000-0000-0000-000000000002'::uuid then
    raise exception 'normalized company lookup crossed owners or missed case-insensitive match: %, %',
      owner_a_match, owner_b_match;
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000001', true);
set local role authenticated;

do $$
declare
  visible_ids uuid[];
  dashboard_ids uuid[];
  dashboard_count bigint;
begin
  select array_agg(id order by id) into visible_ids
  from public.companies
  where id in (
    '72000000-0000-0000-0000-000000000001',
    '72000000-0000-0000-0000-000000000002'
  );

  if visible_ids is distinct from array['72000000-0000-0000-0000-000000000001'::uuid] then
    raise exception 'optimized company RLS changed owner isolation: %', visible_ids;
  end if;

  select array_agg(id order by id) into dashboard_ids
  from public.company_dashboard_page(
    null, null, null, null, null, null, null, 25, 0
  );

  select public.company_dashboard_count(
    null, null, null, null, null, null, null
  ) into dashboard_count;

  if dashboard_ids is distinct from array['72000000-0000-0000-0000-000000000001'::uuid]
     or dashboard_count <> 1 then
    raise exception 'optimized dashboard functions changed page/count behavior: %, %',
      dashboard_ids, dashboard_count;
  end if;
end;
$$;

reset role;
rollback;
