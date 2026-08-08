-- Dashboard aggregates, durable email delivery, suppressions, and secure cron.
-- This migration intentionally replaces the normal view and never edits prior migrations.

-- ---------------------------------------------------------------------
-- Dashboard: indexes support owner/company aggregates and latest-row reads.
-- ---------------------------------------------------------------------
create index if not exists deals_owner_company_activity_idx
  on public.deals (owner_id, company_id, hubspot_modified_at desc nulls last, hubspot_created_at desc nulls last);
create index if not exists contacts_owner_company_primary_idx
  on public.contacts (owner_id, company_id, is_primary_contact desc, (email is not null) desc, created_at asc)
  include (full_name, email, phone);
create index if not exists email_sends_owner_company_created_idx
  on public.email_sends (created_by, company_id, created_at desc)
  include (status, sent_at);
create index if not exists attachments_owner_deal_source_idx
  on public.attachments (owner_id, deal_id, source_type);

drop view if exists public.company_dashboard;
create view public.company_dashboard as
with deal_summary as (
  select d.owner_id, d.company_id,
    count(*)::int as deal_count,
    max(coalesce(d.hubspot_modified_at, d.hubspot_created_at, d.created_at)) as last_deal_at,
    string_agg(distinct nullif(d.product, ''), ', ' order by nullif(d.product, '')) as products
  from public.deals d
  where d.company_id is not null
  group by d.owner_id, d.company_id
), primary_contact as (
  select distinct on (ct.owner_id, ct.company_id)
    ct.owner_id, ct.company_id, ct.full_name, ct.email, ct.phone
  from public.contacts ct
  where ct.company_id is not null
  order by ct.owner_id, ct.company_id, ct.is_primary_contact desc, (ct.email is not null) desc, ct.created_at asc
), quote_company as (
  select d.owner_id, d.company_id, true as has_quote
  from public.attachments a
  join public.deals d on d.id = a.deal_id and d.owner_id = a.owner_id
  where a.source_type = 'quote' and d.company_id is not null
  group by d.owner_id, d.company_id
), kyc_company as (
  select k.owner_id, k.company_id, true as has_kyc
  from public.kyc_profiles k
  group by k.owner_id, k.company_id
), latest_email as (
  select distinct on (es.created_by, es.company_id)
    es.created_by, es.company_id, es.status as last_email_status
  from public.email_sends es
  where es.company_id is not null
  order by es.created_by, es.company_id, es.created_at desc, es.id desc
), latest_sent as (
  select es.created_by, es.company_id, max(es.sent_at) as last_email_sent_at
  from public.email_sends es
  where es.company_id is not null and es.sent_at is not null
  group by es.created_by, es.company_id
)
select c.id, c.owner_id, c.name_clean, c.name_raw, c.industry, c.website,
  c.source_priority, c.created_at, c.updated_at,
  pc.full_name as primary_contact_name, pc.email as primary_contact_email, pc.phone as primary_contact_phone,
  ds.products, ds.deal_count, ds.last_deal_at,
  coalesce(qc.has_quote, false) as has_quote, coalesce(kc.has_kyc, false) as has_kyc,
  le.last_email_status, ls.last_email_sent_at
from public.companies c
left join deal_summary ds on ds.owner_id = c.owner_id and ds.company_id = c.id
left join primary_contact pc on pc.owner_id = c.owner_id and pc.company_id = c.id
left join quote_company qc on qc.owner_id = c.owner_id and qc.company_id = c.id
left join kyc_company kc on kc.owner_id = c.owner_id and kc.company_id = c.id
left join latest_email le on le.created_by = c.owner_id and le.company_id = c.id
left join latest_sent ls on ls.created_by = c.owner_id and ls.company_id = c.id
where c.deleted_at is null;
alter view public.company_dashboard set (security_invoker = true);
revoke all on public.company_dashboard from anon;
grant select on public.company_dashboard to authenticated;

-- ---------------------------------------------------------------------
-- Durable queue. Convert the original enum column to a constrained text state
-- so scheduled/sending/retrying can be represented without enum migration traps.
-- ---------------------------------------------------------------------
-- The dashboard view created above reads email_sends.status. Drop it again
-- before changing the column type, then recreate it immediately afterward.
drop view if exists public.company_dashboard;
alter table public.email_sends alter column status drop default;
alter table public.email_sends alter column status type text using status::text;
alter table public.email_sends alter column status set default 'queued';
alter table public.email_sends drop constraint if exists email_sends_status_check;
alter table public.email_sends add constraint email_sends_status_check
  check (status in ('queued', 'scheduled', 'sending', 'retrying', 'sent', 'failed', 'blocked', 'deferred'));

create view public.company_dashboard as
with deal_summary as (
  select d.owner_id, d.company_id, count(*)::int as deal_count,
    max(coalesce(d.hubspot_modified_at, d.hubspot_created_at, d.created_at)) as last_deal_at,
    string_agg(distinct nullif(d.product, ''), ', ' order by nullif(d.product, '')) as products
  from public.deals d where d.company_id is not null group by d.owner_id, d.company_id
), primary_contact as (
  select distinct on (ct.owner_id, ct.company_id) ct.owner_id, ct.company_id, ct.full_name, ct.email, ct.phone
  from public.contacts ct where ct.company_id is not null
  order by ct.owner_id, ct.company_id, ct.is_primary_contact desc, (ct.email is not null) desc, ct.created_at asc
), quote_company as (
  select d.owner_id, d.company_id, true as has_quote from public.attachments a
  join public.deals d on d.id = a.deal_id and d.owner_id = a.owner_id
  where a.source_type = 'quote' and d.company_id is not null group by d.owner_id, d.company_id
), kyc_company as (
  select k.owner_id, k.company_id, true as has_kyc from public.kyc_profiles k group by k.owner_id, k.company_id
), latest_email as (
  select distinct on (es.created_by, es.company_id) es.created_by, es.company_id, es.status as last_email_status
  from public.email_sends es where es.company_id is not null order by es.created_by, es.company_id, es.created_at desc, es.id desc
), latest_sent as (
  select es.created_by, es.company_id, max(es.sent_at) as last_email_sent_at from public.email_sends es
  where es.company_id is not null and es.sent_at is not null group by es.created_by, es.company_id
)
select c.id, c.owner_id, c.name_clean, c.name_raw, c.industry, c.website, c.source_priority, c.created_at, c.updated_at,
  pc.full_name as primary_contact_name, pc.email as primary_contact_email, pc.phone as primary_contact_phone,
  ds.products, ds.deal_count, ds.last_deal_at, coalesce(qc.has_quote, false) as has_quote,
  coalesce(kc.has_kyc, false) as has_kyc, le.last_email_status, ls.last_email_sent_at
from public.companies c
left join deal_summary ds on ds.owner_id = c.owner_id and ds.company_id = c.id
left join primary_contact pc on pc.owner_id = c.owner_id and pc.company_id = c.id
left join quote_company qc on qc.owner_id = c.owner_id and qc.company_id = c.id
left join kyc_company kc on kc.owner_id = c.owner_id and kc.company_id = c.id
left join latest_email le on le.created_by = c.owner_id and le.company_id = c.id
left join latest_sent ls on ls.created_by = c.owner_id and ls.company_id = c.id
where c.deleted_at is null;
alter view public.company_dashboard set (security_invoker = true);
revoke all on public.company_dashboard from anon;
grant select on public.company_dashboard to authenticated;
alter table public.email_sends add column if not exists provider text not null default 'microsoft_graph'
  check (provider in ('microsoft_graph', 'brevo'));
alter table public.email_sends add column if not exists scheduled_at timestamptz;
alter table public.email_sends add column if not exists next_attempt_at timestamptz;
alter table public.email_sends add column if not exists attempt_count integer not null default 0 check (attempt_count >= 0);
alter table public.email_sends add column if not exists claimed_at timestamptz;
alter table public.email_sends add column if not exists lease_expires_at timestamptz;
alter table public.email_sends add column if not exists last_error_code text;
alter table public.email_sends add column if not exists error_details jsonb;
update public.email_sends
set scheduled_at = coalesce(scheduled_at, created_at), next_attempt_at = coalesce(next_attempt_at, created_at)
where scheduled_at is null or next_attempt_at is null;
alter table public.email_sends alter column scheduled_at set not null;
alter table public.email_sends alter column next_attempt_at set not null;
alter table public.email_sends alter column cooldown_seconds set default 60;
alter table public.user_settings alter column daily_send_limit set default 50;
alter table public.user_settings add column if not exists email_provider text not null default 'microsoft_graph'
  check (email_provider in ('microsoft_graph', 'brevo'));
alter table public.user_settings add column if not exists brevo_sender_email text;
create index if not exists email_sends_due_claim_idx
  on public.email_sends (next_attempt_at, scheduled_at, created_at)
  where status in ('queued', 'scheduled', 'retrying');
create index if not exists email_sends_owner_status_sent_idx
  on public.email_sends (created_by, status, sent_at desc nulls last);

create table if not exists public.email_suppressions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  email_normalized text not null,
  reason text not null check (reason in ('unsubscribed', 'hard_bounce', 'complaint', 'manually_blocked')),
  created_at timestamptz not null default now(),
  unique (owner_id, email_normalized)
);
create index if not exists email_suppressions_owner_email_idx on public.email_suppressions (owner_id, email_normalized);
alter table public.email_suppressions enable row level security;
create policy "email_suppressions_owner_all" on public.email_suppressions for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create table if not exists public.email_unsubscribe_tokens (
  id uuid primary key default gen_random_uuid(),
  email_send_id uuid references public.email_sends(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  email_normalized text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists email_unsubscribe_tokens_hash_idx on public.email_unsubscribe_tokens (token_hash);
alter table public.email_unsubscribe_tokens enable row level security;
create policy "email_unsubscribe_tokens_owner_read" on public.email_unsubscribe_tokens for select to authenticated
  using (owner_id = auth.uid());

-- Browser-only queue insertion: ownership comes from auth.uid(), recipient
-- suppression is authoritative, and opaque opt-out tokens have no user ID in URLs.
create or replace function public.queue_bulk_email(messages jsonb, consent_confirmed boolean, unsubscribe_base_url text)
returns table(email_send_id uuid, status text, scheduled_at timestamptz, blocked_reason text)
language plpgsql security invoker set search_path = public, extensions as $$
declare
  uid uuid := auth.uid(); item jsonb; position integer := 0; raw_token text; send_id uuid;
  email_value text; normalized text; cooldown integer; scheduled timestamptz;
begin
  if uid is null then raise exception 'Authentication is required'; end if;
  if not consent_confirmed then raise exception 'Recipient consent confirmation is required'; end if;
  if unsubscribe_base_url !~ '^https?://' then raise exception 'A valid unsubscribe URL is required'; end if;
  for item in select value from jsonb_array_elements(messages) loop
    email_value := lower(btrim(item->>'to_email'));
    normalized := email_value;
    cooldown := greatest(30, coalesce((item->>'cooldown_seconds')::integer, 60));
    scheduled := now() + make_interval(secs => position * cooldown);
    position := position + 1;
    if email_value = '' then continue; end if;
    if exists (select 1 from public.email_suppressions s where s.owner_id = uid and s.email_normalized = normalized) then
      continue;
    end if;
    raw_token := encode(gen_random_bytes(32), 'hex');
    insert into public.email_sends (company_id, template_id, to_email, subject, body_rendered, status, provider,
      cooldown_seconds, scheduled_at, next_attempt_at, created_by)
    values ((item->>'company_id')::uuid, nullif(item->>'template_id','')::uuid, email_value, item->>'subject',
      concat(coalesce(item->>'body',''), E'\n\nTo stop receiving these messages, unsubscribe: ', unsubscribe_base_url, '?token=', raw_token),
      case when scheduled > now() then 'scheduled' else 'queued' end, coalesce(item->>'provider','microsoft_graph'),
      cooldown, scheduled, scheduled, uid)
    returning id into send_id;
    insert into public.email_unsubscribe_tokens (email_send_id, owner_id, email_normalized, token_hash, expires_at)
    values (send_id, uid, normalized, encode(digest(raw_token, 'sha256'), 'hex'), now() + interval '365 days');
    email_send_id := send_id;
    status := case when scheduled > now() then 'scheduled' else 'queued' end;
    scheduled_at := scheduled;
    blocked_reason := null;
    return next;
  end loop;
end $$;
revoke all on function public.queue_bulk_email(jsonb, boolean, text) from public, anon;
grant execute on function public.queue_bulk_email(jsonb, boolean, text) to authenticated;

-- Only the cron worker's service-role client can claim a row. SKIP LOCKED
-- guarantees competing workers never lease the same due email.
create or replace function public.claim_due_email_sends(batch_size integer default 20, lease_seconds integer default 120)
returns setof public.email_sends
language plpgsql security definer set search_path = public, extensions as $$
begin
  return query
  with due as (
    select es.id
    from public.email_sends es
    where es.status in ('queued', 'scheduled', 'retrying')
      and es.scheduled_at <= now() and es.next_attempt_at <= now()
      and (es.lease_expires_at is null or es.lease_expires_at < now())
    order by es.scheduled_at, es.created_at, es.id
    for update skip locked limit greatest(1, least(batch_size, 100))
  )
  update public.email_sends es
  set status = 'sending', claimed_at = now(), lease_expires_at = now() + make_interval(secs => greatest(30, least(lease_seconds, 600))),
      attempt_count = es.attempt_count + 1
  from due where es.id = due.id
  returning es.*;
end $$;
revoke all on function public.claim_due_email_sends(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_due_email_sends(integer, integer) to service_role;

create or replace function public.record_unsubscribe(raw_token text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare token_row public.email_unsubscribe_tokens%rowtype;
begin
  select * into token_row from public.email_unsubscribe_tokens
  where token_hash = encode(digest(raw_token, 'sha256'), 'hex')
    and revoked_at is null and expires_at > now() for update;
  if not found then return false; end if;
  insert into public.email_suppressions (owner_id, email_normalized, reason)
  values (token_row.owner_id, token_row.email_normalized, 'unsubscribed')
  on conflict (owner_id, email_normalized) do nothing;
  update public.email_unsubscribe_tokens set used_at = coalesce(used_at, now()) where id = token_row.id;
  return true;
end $$;
revoke all on function public.record_unsubscribe(text) from public, anon, authenticated;
grant execute on function public.record_unsubscribe(text) to service_role;

-- The schedule remains dormant until the operator stores queue_worker_url and
-- queue_cron_secret in Supabase Vault. Neither value appears in client code.
do $$ begin
  create extension if not exists pg_net with schema extensions;
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'process-email-queue-every-minute';
  perform cron.schedule('process-email-queue-every-minute', '* * * * *', $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'queue_worker_url' limit 1),
      headers := jsonb_build_object('Content-Type','application/json','X-Queue-Cron-Secret',
        (select decrypted_secret from vault.decrypted_secrets where name = 'queue_cron_secret' limit 1)),
      body := '{}'::jsonb
    );
  $job$);
exception when others then
  raise notice 'Unable to install email cron schedule: %', sqlerrm;
end $$;
