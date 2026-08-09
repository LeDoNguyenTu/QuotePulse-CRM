begin;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'coverage-a@example.test', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'coverage-b@example.test', '', '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.hubspot_property_catalog (
  owner_id, object_type, property_name, label, has_value
)
values
  ('11111111-1111-1111-1111-111111111111', 'deals', 'amount', 'Amount', true),
  ('11111111-1111-1111-1111-111111111111', 'deals', 'blank_field', 'Blank', false),
  ('22222222-2222-2222-2222-222222222222', 'deals', 'other_owner', 'Other', true);

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

do $$
declare
  coverage text;
begin
  select string_agg(property_name, ',' order by property_name)
  into coverage
  from public.hubspot_property_names_with_values('deals');

  if coverage is distinct from 'amount' then
    raise exception 'owner-scoped coverage mismatch: %', coverage;
  end if;
end;
$$;

insert into public.companies (id, owner_id, name_clean)
values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  'Test Company'
);

insert into public.deals (
  id, owner_id, company_id, hubspot_deal_id, is_archived,
  hubspot_properties, hubspot_properties_schema_version
)
values
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    '11111111-1111-1111-1111-111111111111',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'hs-1', false, '{"custom_region":"Singapore"}'::jsonb, 'vold'
  ),
  (
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    '11111111-1111-1111-1111-111111111111',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'hs-archived', true, '{}'::jsonb, 'vold'
  );

do $$
declare
  affected integer;
  stored_version text;
  stored_amount text;
  stored_region text;
begin
  affected := public.apply_hubspot_deal_property_snapshots(
    '11111111-1111-1111-1111-111111111111',
    'vtest',
    '[{"hubspot_deal_id":"hs-1","properties":{"amount":"1200"}}]'::jsonb
  );

  select hubspot_properties_schema_version,
         hubspot_properties ->> 'amount',
         hubspot_properties ->> 'custom_region'
  into stored_version, stored_amount, stored_region
  from public.deals
  where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  if affected <> 1 or stored_version <> 'vtest' or stored_amount <> '1200'
     or stored_region <> 'Singapore' then
    raise exception 'bulk snapshot update mismatch: %, %, %, %',
      affected, stored_version, stored_amount, stored_region;
  end if;
end;
$$;

do $$
begin
  if not public.hubspot_deal_property_backfill_needed(
    '11111111-1111-1111-1111-111111111111', 'vnext'
  ) then
    raise exception 'active stale deal was not detected';
  end if;

  update public.deals
  set hubspot_properties_schema_version = 'vnext'
  where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  if public.hubspot_deal_property_backfill_needed(
    '11111111-1111-1111-1111-111111111111', 'vnext'
  ) then
    raise exception 'archived stale deal must not restart the active repair stream';
  end if;
end;
$$;

do $$
begin
  if has_function_privilege(
    'authenticated',
    'public.apply_hubspot_deal_property_snapshots(uuid,text,jsonb)',
    'execute'
  ) then
    raise exception 'authenticated must not execute the service-only snapshot RPC';
  end if;
end;
$$;

rollback;
