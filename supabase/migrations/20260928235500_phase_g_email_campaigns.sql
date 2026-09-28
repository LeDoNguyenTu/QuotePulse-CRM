create table public.crm_email_campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 200),
  template_id uuid references public.email_templates(id) on delete set null,
  subject text not null check (length(btrim(subject)) between 1 and 500),
  body text not null check (length(btrim(body)) between 1 and 100000),
  provider text not null default 'microsoft_graph' check (provider in ('microsoft_graph', 'brevo')),
  cooldown_seconds integer not null default 60 check (cooldown_seconds >= 30),
  audience_filter jsonb not null default '{}'::jsonb,
  consent_confirmed_at timestamptz not null,
  consent_confirmed_by uuid not null references auth.users(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft', 'queued', 'active', 'completed', 'cancelled')),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  updated_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id)
);

create table public.crm_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  campaign_id uuid not null,
  contact_id uuid,
  company_id uuid,
  email_normalized text not null,
  contact_name text,
  company_name text,
  industry text,
  status text not null check (status in ('queued', 'scheduled', 'sending', 'retrying', 'sent', 'failed', 'blocked', 'deferred')),
  blocked_reason text,
  email_send_id uuid references public.email_sends(id) on delete set null,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (workspace_id, campaign_id, email_normalized),
  foreign key (workspace_id, campaign_id) references public.crm_email_campaigns(workspace_id, id) on delete cascade,
  foreign key (workspace_id, contact_id) references public.crm_contacts(workspace_id, id) on delete set null (contact_id),
  foreign key (workspace_id, company_id) references public.crm_companies(workspace_id, id) on delete set null (company_id)
);

alter table public.email_sends add column workspace_id uuid references public.workspaces(id) on delete set null;
alter table public.email_sends add column campaign_id uuid;
alter table public.email_sends add column crm_contact_id uuid;
alter table public.email_sends add column crm_company_id uuid;
alter table public.email_sends add column recipient_snapshot jsonb;
alter table public.email_sends add constraint email_sends_campaign_fk
  foreign key (workspace_id, campaign_id) references public.crm_email_campaigns(workspace_id, id) on delete set null (campaign_id);
alter table public.email_sends add constraint email_sends_crm_contact_fk
  foreign key (workspace_id, crm_contact_id) references public.crm_contacts(workspace_id, id) on delete set null (crm_contact_id);
alter table public.email_sends add constraint email_sends_crm_company_fk
  foreign key (workspace_id, crm_company_id) references public.crm_companies(workspace_id, id) on delete set null (crm_company_id);
create index email_sends_workspace_campaign_idx on public.email_sends(workspace_id, campaign_id, created_at desc);
create index crm_campaign_recipients_campaign_status_idx on public.crm_campaign_recipients(workspace_id, campaign_id, status);

create trigger crm_email_campaigns_preserve_tenant_audit before update on public.crm_email_campaigns
for each row execute function private.crm_preserve_tenant_audit();
create trigger crm_email_campaigns_updated_at before update on public.crm_email_campaigns
for each row execute function public.set_updated_at();

alter table public.crm_email_campaigns enable row level security;
alter table public.crm_campaign_recipients enable row level security;
revoke all on table public.crm_email_campaigns, public.crm_campaign_recipients from anon, authenticated;
grant select on table public.crm_email_campaigns to authenticated;
grant select on table public.crm_campaign_recipients to authenticated;
grant all on table public.crm_email_campaigns, public.crm_campaign_recipients to service_role;

create policy crm_email_campaigns_member_select on public.crm_email_campaigns for select to authenticated
using (exists (select 1 from public.workspace_members m where m.workspace_id = crm_email_campaigns.workspace_id and m.user_id = auth.uid()));
create policy crm_campaign_recipients_member_select on public.crm_campaign_recipients for select to authenticated
using (exists (select 1 from public.workspace_members m where m.workspace_id = crm_campaign_recipients.workspace_id and m.user_id = auth.uid()));

create view public.crm_email_campaign_reporting
with (security_invoker = true) as
select c.*,
  count(r.id)::integer as recipient_count,
  count(r.id) filter (where r.status = 'queued')::integer as queued_count,
  count(r.id) filter (where r.status = 'scheduled')::integer as scheduled_count,
  count(r.id) filter (where r.status = 'sending')::integer as sending_count,
  count(r.id) filter (where r.status = 'retrying')::integer as retrying_count,
  count(r.id) filter (where r.status = 'sent')::integer as sent_count,
  count(r.id) filter (where r.status = 'deferred')::integer as deferred_count,
  count(r.id) filter (where r.status = 'blocked')::integer as blocked_count,
  count(r.id) filter (where r.status = 'failed')::integer as failed_count
from public.crm_email_campaigns c
left join public.crm_campaign_recipients r on r.workspace_id = c.workspace_id and r.campaign_id = c.id
group by c.id;
revoke all on public.crm_email_campaign_reporting from anon;
grant select on public.crm_email_campaign_reporting to authenticated;

create view public.crm_campaign_audience
with (security_invoker = true) as
select ct.workspace_id, ct.id as contact_id, ct.company_id,
  coalesce(nullif(btrim(ct.full_name), ''), nullif(btrim(concat_ws(' ', ct.first_name, ct.last_name)), '')) as contact_name,
  lower(btrim(ct.email)) as email_normalized, co.name as company_name, co.industry
from public.crm_contacts ct
left join public.crm_companies co on co.workspace_id = ct.workspace_id and co.id = ct.company_id
where nullif(btrim(ct.email), '') is not null;
revoke all on public.crm_campaign_audience from anon;
grant select on public.crm_campaign_audience to authenticated;

create or replace function private.crm_sync_campaign_recipient_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.campaign_id is not null then
    update public.crm_campaign_recipients
    set status = new.status, blocked_reason = new.error_message
    where workspace_id = new.workspace_id and campaign_id = new.campaign_id and email_send_id = new.id;
    update public.crm_email_campaigns c set status = case
      when exists (select 1 from public.crm_campaign_recipients r where r.workspace_id = c.workspace_id and r.campaign_id = c.id and r.status in ('queued','scheduled','sending','retrying')) then 'active'
      else 'completed' end, updated_at = now()
    where c.workspace_id = new.workspace_id and c.id = new.campaign_id;
  end if;
  return new;
end $$;
revoke all on function private.crm_sync_campaign_recipient_status() from public, anon, authenticated;
create trigger email_sends_sync_campaign_recipient after update of status on public.email_sends
for each row when (new.campaign_id is not null) execute function private.crm_sync_campaign_recipient_status();

create or replace function public.crm_queue_email_campaign(
  p_workspace_id uuid, p_name text, p_subject text, p_body text,
  p_provider text, p_cooldown_seconds integer, p_contact_ids uuid[],
  p_industries text[], p_search text, p_template_id uuid,
  p_consent_confirmed boolean, p_unsubscribe_base_url text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid(); v_campaign uuid; v_position integer := 0;
  v_row record; v_send uuid; v_token text; v_scheduled timestamptz;
  v_queued integer := 0; v_blocked integer := 0;
begin
  if v_user is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not exists (select 1 from public.workspace_members m where m.workspace_id = p_workspace_id and m.user_id = v_user) then raise exception 'workspace membership required' using errcode = '42501'; end if;
  if p_consent_confirmed is distinct from true then raise exception 'recipient consent confirmation is required' using errcode = '22023'; end if;
  if coalesce(p_unsubscribe_base_url, '') !~ '^https?://' then raise exception 'valid unsubscribe URL required' using errcode = '22023'; end if;
  if p_provider not in ('microsoft_graph', 'brevo') then raise exception 'unsupported email provider' using errcode = '22023'; end if;
  if nullif(btrim(p_name), '') is null or nullif(btrim(p_subject), '') is null or nullif(btrim(p_body), '') is null then raise exception 'campaign name, subject, and body are required' using errcode = '22023'; end if;
  if p_template_id is not null and not exists (select 1 from public.email_templates t where t.id = p_template_id and t.owner_id = v_user) then raise exception 'template not found' using errcode = '22023'; end if;

  insert into public.crm_email_campaigns(workspace_id,name,template_id,subject,body,provider,cooldown_seconds,audience_filter,consent_confirmed_at,consent_confirmed_by,status,created_by,updated_by)
  values (p_workspace_id,btrim(p_name),p_template_id,btrim(p_subject),p_body,p_provider,greatest(30,p_cooldown_seconds),
    jsonb_build_object('contact_ids',coalesce(to_jsonb(p_contact_ids),'null'::jsonb),'industries',coalesce(to_jsonb(p_industries),'null'::jsonb),'search',p_search),now(),v_user,'queued',v_user,v_user)
  returning id into v_campaign;

  for v_row in
    select distinct on (lower(btrim(ct.email))) ct.id contact_id, ct.company_id, lower(btrim(ct.email)) email,
      coalesce(nullif(btrim(ct.full_name),''), nullif(btrim(concat_ws(' ',ct.first_name,ct.last_name)),'')) contact_name,
      co.name company_name, co.industry
    from public.crm_contacts ct left join public.crm_companies co on co.workspace_id = ct.workspace_id and co.id = ct.company_id
    where ct.workspace_id = p_workspace_id and nullif(btrim(ct.email),'') is not null
      and (p_contact_ids is null or cardinality(p_contact_ids) = 0 or ct.id = any(p_contact_ids))
      and (p_industries is null or cardinality(p_industries) = 0 or co.industry = any(p_industries))
      and (nullif(btrim(p_search),'') is null or coalesce(ct.full_name,'') ilike '%'||btrim(p_search)||'%' or ct.email ilike '%'||btrim(p_search)||'%' or coalesce(co.name,'') ilike '%'||btrim(p_search)||'%')
    order by lower(btrim(ct.email)), ct.id
  loop
    if v_position + v_blocked >= 5000 then raise exception 'campaign audience exceeds the 5,000 recipient safety limit' using errcode = '54000'; end if;
    if exists (select 1 from public.email_suppressions s where s.owner_id = v_user and s.email_normalized = v_row.email) then
      insert into public.crm_campaign_recipients(workspace_id,campaign_id,contact_id,company_id,email_normalized,contact_name,company_name,industry,status,blocked_reason,created_by)
      values(p_workspace_id,v_campaign,v_row.contact_id,v_row.company_id,v_row.email,v_row.contact_name,v_row.company_name,v_row.industry,'blocked','Recipient is suppressed.',v_user);
      v_blocked := v_blocked + 1; continue;
    end if;
    v_scheduled := now() + make_interval(secs => v_position * greatest(30,p_cooldown_seconds)); v_position := v_position + 1;
    v_token := encode(extensions.gen_random_bytes(32),'hex');
    insert into public.email_sends(workspace_id,campaign_id,crm_contact_id,crm_company_id,to_email,template_id,subject,body_rendered,status,provider,cooldown_seconds,scheduled_at,next_attempt_at,created_by,recipient_snapshot)
    values(p_workspace_id,v_campaign,v_row.contact_id,v_row.company_id,v_row.email,p_template_id,p_subject,
      concat(p_body,E'\n\nTo stop receiving these messages, unsubscribe: ',p_unsubscribe_base_url,'?token=',v_token),
      case when v_scheduled > now() then 'scheduled' else 'queued' end,p_provider,greatest(30,p_cooldown_seconds),v_scheduled,v_scheduled,v_user,
      jsonb_build_object('company_name',v_row.company_name,'contact_name',v_row.contact_name,'industry',v_row.industry)) returning id into v_send;
    insert into public.email_unsubscribe_tokens(email_send_id,owner_id,email_normalized,token_hash,expires_at)
    values(v_send,v_user,v_row.email,encode(extensions.digest(v_token,'sha256'),'hex'),now()+interval '365 days');
    insert into public.crm_campaign_recipients(workspace_id,campaign_id,contact_id,company_id,email_normalized,contact_name,company_name,industry,status,email_send_id,created_by)
    values(p_workspace_id,v_campaign,v_row.contact_id,v_row.company_id,v_row.email,v_row.contact_name,v_row.company_name,v_row.industry,case when v_scheduled > now() then 'scheduled' else 'queued' end,v_send,v_user);
    v_queued := v_queued + 1;
  end loop;
  if v_queued = 0 and v_blocked = 0 then raise exception 'campaign audience is empty' using errcode = '22023'; end if;
  if v_queued = 0 then update public.crm_email_campaigns set status = 'completed', updated_by = v_user where id = v_campaign and workspace_id = p_workspace_id; end if;
  return jsonb_build_object('campaign_id',v_campaign,'queued',v_queued,'blocked',v_blocked);
end $$;
revoke all on function public.crm_queue_email_campaign(uuid,text,text,text,text,integer,uuid[],text[],text,uuid,boolean,text) from public, anon;
grant execute on function public.crm_queue_email_campaign(uuid,text,text,text,text,integer,uuid[],text[],text,uuid,boolean,text) to authenticated;
