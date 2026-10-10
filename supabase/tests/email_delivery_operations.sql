begin;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  'ea000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'email-operations@example.test', '',
  '{}'::jsonb, '{}'::jsonb, now(), now()
), (
  'ea000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'email-operations-other@example.test', '',
  '{}'::jsonb, '{}'::jsonb, now(), now()
);

set local role service_role;

do $$
declare
  workspace_id uuid;
begin
  select id into workspace_id from public.workspaces
  where kind = 'sales_crm' and created_by = 'ea000000-0000-0000-0000-000000000001';
  perform set_config('test.email_operations_workspace', workspace_id::text, true);

  insert into public.crm_email_campaigns (
    id, workspace_id, name, subject, body, body_text, provider, cooldown_seconds,
    audience_filter, consent_confirmed_at, consent_confirmed_by, status, created_by, updated_by
  ) values (
    'ea100000-0000-0000-0000-000000000001', workspace_id, 'Retry chain', 'Subject', 'Body', 'Body',
    'brevo', 60, '{}'::jsonb, now(), 'ea000000-0000-0000-0000-000000000001', 'completed',
    'ea000000-0000-0000-0000-000000000001', 'ea000000-0000-0000-0000-000000000001'
  );

  insert into public.email_sends (
    id, workspace_id, campaign_id, to_email, subject, body_rendered, body_html_rendered,
    status, provider, cooldown_seconds, scheduled_at, next_attempt_at, created_by, failed_at
  ) values (
    'ea200000-0000-0000-0000-000000000001', workspace_id, 'ea100000-0000-0000-0000-000000000001',
    'person@example.test', 'Subject', 'Rendered body', '<p>Rendered body</p>', 'failed', 'brevo', 60,
    now(), now(), 'ea000000-0000-0000-0000-000000000001', now()
  );

  insert into public.crm_campaign_recipients (
    workspace_id, campaign_id, email_normalized, contact_name, status, email_send_id, created_by
  ) values (
    workspace_id, 'ea100000-0000-0000-0000-000000000001', 'person@example.test', 'Test person',
    'failed', 'ea200000-0000-0000-0000-000000000001', 'ea000000-0000-0000-0000-000000000001'
  );
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', 'ea000000-0000-0000-0000-000000000002', true);
set local role authenticated;

do $$
begin
  perform public.crm_retry_failed_email_send(
    current_setting('test.email_operations_workspace')::uuid,
    'ea200000-0000-0000-0000-000000000001'
  );
  raise exception 'non-member retry unexpectedly succeeded';
exception when sqlstate '42501' then null;
end;
$$;

reset role;
set local role service_role;
insert into public.workspace_members (workspace_id, user_id, role)
values (
  current_setting('test.email_operations_workspace')::uuid,
  'ea000000-0000-0000-0000-000000000002',
  'member'
);
reset role;
set local role authenticated;

do $$
begin
  perform public.crm_retry_failed_email_send(
    current_setting('test.email_operations_workspace')::uuid,
    'ea200000-0000-0000-0000-000000000001'
  );
  raise exception 'non-owner retry unexpectedly succeeded';
exception when sqlstate '42501' then null;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', 'ea000000-0000-0000-0000-000000000001', true);
set local role authenticated;

select set_config(
  'test.retry_b',
  (public.crm_retry_failed_email_send(
    current_setting('test.email_operations_workspace')::uuid,
    'ea200000-0000-0000-0000-000000000001'
  )->>'email_send_id'),
  true
);

do $$
declare
  repeated_id uuid;
begin
  repeated_id := (public.crm_retry_failed_email_send(
    current_setting('test.email_operations_workspace')::uuid,
    'ea200000-0000-0000-0000-000000000001'
  )->>'email_send_id')::uuid;
  if repeated_id <> current_setting('test.retry_b')::uuid then
    raise exception 'idempotent retry did not return the current active child';
  end if;
end;
$$;

reset role;
set local role service_role;
update public.email_sends set status = 'failed', failed_at = now()
where id = current_setting('test.retry_b')::uuid;
reset role;
set local role authenticated;

select set_config(
  'test.retry_c',
  (public.crm_retry_failed_email_send(
    current_setting('test.email_operations_workspace')::uuid,
    current_setting('test.retry_b')::uuid
  )->>'email_send_id'),
  true
);

reset role;
set local role service_role;
update public.email_sends set status = 'sent', sent_at = now()
where id = current_setting('test.retry_c')::uuid;
reset role;
set local role authenticated;

do $$
declare
  failed_attempts integer;
  sent_attempts integer;
  current_count integer;
  current_status text;
begin
  select count(*) filter (where status = 'failed'), count(*) filter (where status = 'sent'),
    count(*) filter (where is_current_attempt), max(status) filter (where is_current_attempt)
  into failed_attempts, sent_attempts, current_count, current_status
  from public.crm_campaign_recipient_reporting
  where campaign_id = 'ea100000-0000-0000-0000-000000000001';

  if failed_attempts <> 2 or sent_attempts <> 1 or current_count <> 1 or current_status <> 'sent' then
    raise exception 'historical attempt states were not preserved: failed %, sent %, current %/%', failed_attempts, sent_attempts, current_count, current_status;
  end if;

  begin
    perform public.crm_retry_failed_email_send(
      current_setting('test.email_operations_workspace')::uuid,
      'ea200000-0000-0000-0000-000000000001'
    );
    raise exception 'retrying a non-current historical failure unexpectedly succeeded';
  exception when sqlstate '22023' then null;
  end;
end;
$$;

reset role;
rollback;
