-- =====================================================================
-- 0006_product_industry.sql
--
-- Three things this adds:
--
--  1. deals.product — the brand/service the customer is buying, which lives in
--     the deal name ahead of the customer ("ADOBE (REN) - THE PR PEOPLE PTE LTD").
--     It used to be thrown away, and worse, used AS the company. Keeping it as a
--     column lets the UI show it next to the customer, and lets the importer
--     LEARN the vendor list from the deals that are punctuated properly, so it
--     can also split the ones that are not ("ADOBE (REN) THE TANGLIN CLUB",
--     "ADOBE-CHRISTOPHER JAYAM (BOL)").
--
--  2. deals.hubspot_modified_at — HubSpot's hs_lastmodifieddate, stored so a
--     re-import can SKIP a deal it already holds unchanged instead of re-reading
--     its companies, contacts, notes and attachments. Without it every import
--     re-walked the entire portal.
--
--  3. company_industries — the industry filter used to be populated from the
--     `industries` lookup table, so it offered ten industries while the actual
--     companies had none, and every choice filtered to zero rows. The dropdown
--     now reads the industries that are actually present in the user's data.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. deals: product + change watermark
-- ---------------------------------------------------------------------
alter table deals add column if not exists product              text;
alter table deals add column if not exists hubspot_modified_at  timestamptz;

create index if not exists deals_owner_product_idx on deals (owner_id, product);

-- ---------------------------------------------------------------------
-- 2. companies: the industry filter needs an index once it is really used
-- ---------------------------------------------------------------------
create index if not exists companies_owner_industry_idx on companies (owner_id, industry);

-- ---------------------------------------------------------------------
-- 3. industries lookup — the seeded ten cannot describe this book of business
--    (schools, churches, statutory boards, shipyards, engineering firms).
-- ---------------------------------------------------------------------
insert into industries (name) values
  ('Engineering'),
  ('Government'),
  ('Non-profit'),
  ('Real Estate'),
  ('Media & Creative'),
  ('Energy & Marine'),
  ('Food & Beverage'),
  ('Legal')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------
-- 4. company_dashboard: expose the products a company buys.
--
--    DROP + CREATE, never CREATE OR REPLACE — replacing a view can only APPEND
--    columns, and any reshuffle reads as a column rename (Postgres 42P16). See
--    0005, which failed in CI for exactly this reason.
-- ---------------------------------------------------------------------
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

alter view company_dashboard set (security_invoker = true);
revoke all on company_dashboard from anon;
grant select on company_dashboard to authenticated;

-- ---------------------------------------------------------------------
-- 5. company_industries: what the filter dropdown should actually offer.
--    security_invoker, so RLS on `companies` scopes it to the caller.
-- ---------------------------------------------------------------------
drop view if exists company_industries;

create view company_industries as
select
  c.owner_id,
  c.industry,
  count(*)::int as company_count
from companies c
where c.deleted_at is null
  and c.industry is not null
  and btrim(c.industry) <> ''
group by c.owner_id, c.industry;

alter view company_industries set (security_invoker = true);
revoke all on company_industries from anon;
grant select on company_industries to authenticated;
