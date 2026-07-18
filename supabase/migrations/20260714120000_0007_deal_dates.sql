-- =====================================================================
-- 0007_deal_dates.sql
--
--  1. deals.hubspot_created_at — HubSpot's own `createdate`. We already stored
--     hubspot_modified_at (hs_lastmodifieddate); this adds the creation time so
--     the UI can show both and sort by recency.
--
--  2. company_dashboard gains last_deal_at + deal_count, so the company list can
--     be ordered newest-activity-first — the user should be working the freshest
--     deals, not scrolling to find them.
--
--  DROP + CREATE, never CREATE OR REPLACE (a replace can only APPEND columns;
--  reshuffling reads as a rename → Postgres 42P16). See 0005/0006.
-- =====================================================================

alter table deals add column if not exists hubspot_created_at timestamptz;

-- Sort key for both the per-company aggregate and the deals list.
create index if not exists deals_owner_modified_idx
  on deals (owner_id, hubspot_modified_at desc nulls last);

drop view if exists company_dashboard;

create view company_dashboard as
select
  c.id,
  c.owner_id,
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
  (
    select string_agg(distinct d.product, ', ' order by d.product)
    from deals d
    where d.company_id = c.id and d.product is not null and d.product <> ''
  ) as products,
  dd.deal_count,
  dd.last_deal_at,
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
left join lateral (
  select
    count(*)::int as deal_count,
    -- HubSpot's modified date is the real signal of activity; fall back to when
    -- we first saw the deal for rows that predate the column.
    max(coalesce(d.hubspot_modified_at, d.created_at)) as last_deal_at
  from deals d
  where d.company_id = c.id
) dd on true
where c.deleted_at is null;

alter view company_dashboard set (security_invoker = true);
revoke all on company_dashboard from anon;
grant select on company_dashboard to authenticated;
