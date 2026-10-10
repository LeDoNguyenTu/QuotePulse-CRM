alter table public.email_sends
  add column if not exists retry_of_id uuid references public.email_sends(id) on delete set null;

create unique index if not exists email_sends_one_direct_retry_idx
  on public.email_sends(retry_of_id)
  where retry_of_id is not null;

create index if not exists email_sends_crm_contact_history_idx
  on public.email_sends(workspace_id, crm_contact_id, created_at desc)
  where crm_contact_id is not null;

create or replace view public.crm_campaign_recipient_reporting
with (security_invoker = true) as
select
  recipient.id,
  recipient.workspace_id,
  recipient.campaign_id,
  recipient.contact_id,
  recipient.company_id,
  recipient.email_normalized,
  recipient.contact_name,
  recipient.company_name,
  recipient.industry,
  recipient.status,
  recipient.blocked_reason,
  recipient.email_send_id,
  recipient.created_at,
  campaign.name as campaign_name,
  send.id as attempt_id,
  send.id = recipient.email_send_id as is_current_attempt,
  send.subject,
  send.body_rendered,
  send.body_html_rendered,
  send.provider,
  send.provider_message_id,
  send.attempt_count,
  send.scheduled_at,
  send.next_attempt_at,
  send.sent_at,
  send.error_message,
  send.last_error_code,
  send.error_details,
  send.retry_of_id,
  send.created_at as send_created_at,
  send.updated_at as send_updated_at
from public.crm_campaign_recipients recipient
join public.crm_email_campaigns campaign
  on campaign.workspace_id = recipient.workspace_id
 and campaign.id = recipient.campaign_id
left join public.email_sends send
  on send.workspace_id = recipient.workspace_id
 and send.campaign_id = recipient.campaign_id
 and lower(btrim(send.to_email)) = recipient.email_normalized;

revoke all on public.crm_campaign_recipient_reporting from public, anon;
grant select on public.crm_campaign_recipient_reporting to authenticated;

create or replace view public.crm_contact_email_history
with (security_invoker = true) as
select
  send.id,
  send.workspace_id,
  send.campaign_id,
  send.crm_contact_id as contact_id,
  send.crm_company_id as company_id,
  send.to_email,
  send.subject,
  send.body_rendered,
  send.body_html_rendered,
  send.status,
  send.provider,
  send.provider_message_id,
  send.attempt_count,
  send.scheduled_at,
  send.next_attempt_at,
  send.sent_at,
  send.error_message,
  send.last_error_code,
  send.error_details,
  send.retry_of_id,
  send.created_at,
  send.updated_at,
  campaign.name as campaign_name
from public.email_sends send
left join public.crm_email_campaigns campaign
  on campaign.workspace_id = send.workspace_id
 and campaign.id = send.campaign_id
where send.crm_contact_id is not null;

revoke all on public.crm_contact_email_history from public, anon;
grant select on public.crm_contact_email_history to authenticated;

create or replace function public.crm_retry_failed_email_send(
  p_workspace_id uuid,
  p_email_send_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_source public.email_sends%rowtype;
  v_retry_id uuid;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace_id and m.user_id = v_user
  ) then
    raise exception 'workspace membership required' using errcode = '42501';
  end if;

  select send.* into v_source
  from public.email_sends send
  where send.id = p_email_send_id
    and send.workspace_id = p_workspace_id
  for update;

  if not found then raise exception 'email send not found' using errcode = 'P0002'; end if;
  if v_source.created_by <> v_user then raise exception 'email send owner required' using errcode = '42501'; end if;
  if v_source.status <> 'failed' then raise exception 'only definitive failed sends can be retried' using errcode = '22023'; end if;
  if v_source.provider_message_id is not null then raise exception 'provider accepted this send; retry could duplicate delivery' using errcode = '22023'; end if;

  select retry.id into v_retry_id
  from public.email_sends retry
  where retry.retry_of_id = p_email_send_id
  order by retry.created_at desc
  limit 1;

  if v_retry_id is null then
    insert into public.email_sends (
      workspace_id, campaign_id, crm_contact_id, crm_company_id,
      company_id, contact_id, template_id, to_email, subject,
      body_rendered, body_html_rendered, status, provider, cooldown_seconds,
      scheduled_at, next_attempt_at, created_by, recipient_snapshot, retry_of_id
    ) values (
      v_source.workspace_id, v_source.campaign_id, v_source.crm_contact_id, v_source.crm_company_id,
      v_source.company_id, v_source.contact_id, v_source.template_id, v_source.to_email, v_source.subject,
      v_source.body_rendered, v_source.body_html_rendered, 'queued', v_source.provider, v_source.cooldown_seconds,
      now(), now(), v_user, v_source.recipient_snapshot, p_email_send_id
    )
    on conflict (retry_of_id) where retry_of_id is not null do nothing
    returning id into v_retry_id;

    if v_retry_id is null then
      select retry.id into v_retry_id
      from public.email_sends retry
      where retry.retry_of_id = p_email_send_id
      order by retry.created_at desc
      limit 1;
    end if;
  end if;

  update public.crm_campaign_recipients
  set email_send_id = v_retry_id,
      status = 'queued',
      blocked_reason = null
  where workspace_id = p_workspace_id
    and campaign_id = v_source.campaign_id
    and email_normalized = lower(btrim(v_source.to_email));

  update public.crm_email_campaigns
  set status = 'active', updated_at = now(), updated_by = v_user
  where workspace_id = p_workspace_id and id = v_source.campaign_id;

  return jsonb_build_object('email_send_id', v_retry_id, 'status', 'queued');
end;
$$;

revoke all on function public.crm_retry_failed_email_send(uuid,uuid) from public, anon;
grant execute on function public.crm_retry_failed_email_send(uuid,uuid) to authenticated;
