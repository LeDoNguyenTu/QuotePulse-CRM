-- Local-CI-only fixture. The verification script removes every row it creates.
delete from public.email_sends where created_by = 'eb000000-0000-0000-0000-000000000001';
delete from public.workspaces where created_by = 'eb000000-0000-0000-0000-000000000001';
delete from auth.users where id = 'eb000000-0000-0000-0000-000000000001';

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  'eb000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'email-retry-race@example.test', '',
  '{}'::jsonb, '{}'::jsonb, now(), now()
);

do $$
declare
  target_workspace_id uuid;
begin
  select id into strict target_workspace_id
  from public.workspaces
  where kind = 'sales_crm'
    and created_by = 'eb000000-0000-0000-0000-000000000001';

  insert into public.crm_email_campaigns (
    id, workspace_id, name, subject, body, body_text, provider, cooldown_seconds,
    audience_filter, consent_confirmed_at, consent_confirmed_by, status, created_by, updated_by
  ) values (
    'eb100000-0000-0000-0000-000000000001', target_workspace_id, 'Retry race', 'Subject',
    'Body', 'Body', 'brevo', 60, '{}'::jsonb, now(),
    'eb000000-0000-0000-0000-000000000001', 'completed',
    'eb000000-0000-0000-0000-000000000001', 'eb000000-0000-0000-0000-000000000001'
  );

  insert into public.email_sends (
    id, workspace_id, campaign_id, to_email, subject, body_rendered, body_html_rendered,
    status, provider, cooldown_seconds, scheduled_at, next_attempt_at, created_by, failed_at
  ) values (
    'eb200000-0000-0000-0000-000000000001', target_workspace_id,
    'eb100000-0000-0000-0000-000000000001', 'race@example.test', 'Subject',
    'Rendered body', '<p>Rendered body</p>', 'failed', 'brevo', 60, now(), now(),
    'eb000000-0000-0000-0000-000000000001', now()
  );

  insert into public.crm_campaign_recipients (
    workspace_id, campaign_id, email_normalized, contact_name, status, email_send_id, created_by
  ) values (
    target_workspace_id, 'eb100000-0000-0000-0000-000000000001', 'race@example.test',
    'Race contact', 'failed', 'eb200000-0000-0000-0000-000000000001',
    'eb000000-0000-0000-0000-000000000001'
  );
end;
$$;
