do $$
begin
  if not has_table_privilege('authenticated', 'public.companies', 'select') then
    raise exception 'authenticated cannot select companies';
  end if;
  if not has_table_privilege('authenticated', 'public.deals', 'select') then
    raise exception 'authenticated cannot select deals';
  end if;
  if not has_table_privilege('authenticated', 'public.contacts', 'select') then
    raise exception 'authenticated cannot select contacts';
  end if;
  if not has_table_privilege('authenticated', 'public.user_settings', 'select,insert,update') then
    raise exception 'authenticated user_settings privileges are incomplete';
  end if;
  if has_table_privilege('authenticated', 'public.hubspot_property_catalog', 'delete') then
    raise exception 'authenticated must not delete HubSpot property catalogue rows';
  end if;
  if not has_table_privilege('authenticated', 'public.email_sends', 'select') then
    raise exception 'authenticated cannot read its email queue';
  end if;
  if has_table_privilege('authenticated', 'public.email_sends', 'insert') then
    raise exception 'authenticated can bypass queue safeguards with a direct email_sends insert';
  end if;
  if has_table_privilege('authenticated', 'public.email_unsubscribe_tokens', 'insert') then
    raise exception 'authenticated can bypass queue safeguards with a direct token insert';
  end if;
  if not has_function_privilege(
    'authenticated',
    'public.queue_bulk_email(jsonb,boolean,text)',
    'execute'
  ) then
    raise exception 'authenticated cannot execute the guarded email queue RPC';
  end if;
end;
$$;

begin;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '33333333-3333-3333-3333-333333333333',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'queue-owner@example.test', '',
  '{}'::jsonb, '{}'::jsonb, now(), now()
);

insert into public.companies (id, owner_id, name_clean)
values (
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  '33333333-3333-3333-3333-333333333333',
  'Queue Test Company'
);

select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
set local role authenticated;

select *
from public.queue_bulk_email(
  '[{"company_id":"dddddddd-dddd-dddd-dddd-dddddddddddd","to_email":"recipient@example.test","subject":"Test","body":"Synthetic test only","cooldown_seconds":60}]'::jsonb,
  true,
  'https://example.test/unsubscribe'
);

reset role;

do $$
declare
  sends integer;
  tokens integer;
begin
  select count(*) into sends
  from public.email_sends
  where created_by = '33333333-3333-3333-3333-333333333333';

  select count(*) into tokens
  from public.email_unsubscribe_tokens
  where owner_id = '33333333-3333-3333-3333-333333333333';

  if sends <> 1 or tokens <> 1 then
    raise exception 'guarded queue RPC did not atomically create send and token: %, %', sends, tokens;
  end if;
end;
$$;

rollback;
