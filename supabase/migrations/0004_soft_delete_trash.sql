-- =====================================================================
-- 0004_soft_delete_trash.sql — Recycle bin for companies
--
--   * companies.deleted_at: when set, the company is "in the trash".
--   * company_dashboard hides trashed companies.
--   * pg_cron hard-deletes companies trashed > 30 days ago (daily 03:00 UTC).
--     If pg_cron can't be enabled, the app also purges expired trash when the
--     recycle bin is opened, so the 30-day retention still holds.
-- =====================================================================

alter table companies add column if not exists deleted_at timestamptz;
create index if not exists companies_deleted_at_idx on companies (deleted_at);

-- ---------------------------------------------------------------------
-- Dashboard view: exclude trashed companies (adds the deleted_at filter).
-- ---------------------------------------------------------------------
create or replace view company_dashboard as
select
  c.id,
  c.name_clean,
  c.name_raw,
  c.industry,
  c.website,
  c.source_priority,
  c.created_at,
  c.updated_at,
  pc.full_name  as primary_contact_name,
  pc.email      as primary_contact_email,
  pc.phone      as primary_contact_phone,
  exists (
    select 1 from attachments a
    join deals d on d.id = a.deal_id
    where d.company_id = c.id and a.source_type = 'quote'
  ) as has_quote,
  exists (select 1 from kyc_profiles k where k.company_id = c.id) as has_kyc,
  (
    select es.status from email_sends es
    where es.company_id = c.id
    order by es.created_at desc limit 1
  ) as last_email_status,
  (
    select es.sent_at from email_sends es
    where es.company_id = c.id and es.sent_at is not null
    order by es.sent_at desc limit 1
  ) as last_email_sent_at
from companies c
left join lateral (
  select full_name, email, phone
  from contacts
  where company_id = c.id
  order by is_primary_contact desc, (email is not null) desc, created_at asc
  limit 1
) pc on true
where c.deleted_at is null;

-- create or replace view keeps grants, but re-assert the invoker + grants to be safe.
alter view company_dashboard set (security_invoker = true);
revoke all on company_dashboard from anon;
grant select on company_dashboard to authenticated;

-- ---------------------------------------------------------------------
-- Auto-purge: hard-delete companies trashed more than 30 days ago.
-- Wrapped defensively so the migration still succeeds if pg_cron is
-- unavailable — the app purges expired trash on view as a fallback.
-- ---------------------------------------------------------------------
do $$
begin
  execute 'create extension if not exists pg_cron';
  perform cron.schedule(
    'purge-trashed-companies',
    '0 3 * * *',
    'delete from companies where deleted_at is not null and deleted_at < now() - interval ''30 days'';'
  );
exception when others then
  raise notice
    'pg_cron not enabled (%): recycle bin still works; the app purges expired trash on open.',
    sqlerrm;
end $$;
