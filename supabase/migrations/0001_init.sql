-- =====================================================================
-- 0001_init.sql — Sales Outreach Tool schema
-- Postgres (Supabase). Enums, tables, indexes, foreign keys, triggers.
-- RLS policies live in 0002_rls.sql.
-- =====================================================================

create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
do $$ begin
  create type source_priority as enum ('recycled', 'deleted', 'current');
exception when duplicate_object then null; end $$;

do $$ begin
  create type contact_source as enum (
    'quote_pdf', 'hubspot_contact', 'note_section', 'linkedin', 'google', 'manual'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type attachment_source as enum ('quote', 'generic');
exception when duplicate_object then null; end $$;

do $$ begin
  create type send_status as enum ('queued', 'sent', 'failed', 'blocked', 'deferred');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- updated_at trigger helper
-- ---------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- industries (canonical list)
-- ---------------------------------------------------------------------
create table if not exists industries (
  id   uuid primary key default gen_random_uuid(),
  name text not null unique
);

-- ---------------------------------------------------------------------
-- companies
-- ---------------------------------------------------------------------
create table if not exists companies (
  id                  uuid primary key default gen_random_uuid(),
  name_clean          text not null,
  name_raw            text,
  industry            text,
  website             text,
  hubspot_company_id  text,
  source_priority     source_priority not null default 'current',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- One canonical company per cleaned name (case-insensitive). Used as the
-- upsert key by the HubSpot ingest function.
create unique index if not exists companies_name_clean_key
  on companies (lower(name_clean));
create index if not exists companies_hubspot_company_id_idx
  on companies (hubspot_company_id);
create index if not exists companies_industry_idx
  on companies (industry);
create index if not exists companies_source_priority_idx
  on companies (source_priority);

-- Full-text search vector across the raw + clean names + industry.
alter table companies
  add column if not exists search_tsv tsvector
  generated always as (
    to_tsvector('simple',
      coalesce(name_clean, '') || ' ' ||
      coalesce(name_raw, '')   || ' ' ||
      coalesce(industry, ''))
  ) stored;
create index if not exists companies_search_tsv_idx on companies using gin (search_tsv);

drop trigger if exists trg_companies_updated_at on companies;
create trigger trg_companies_updated_at before update on companies
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- deals
-- ---------------------------------------------------------------------
create table if not exists deals (
  id              uuid primary key default gen_random_uuid(),
  hubspot_deal_id text unique,
  company_id      uuid references companies(id) on delete set null,
  deal_name_raw   text,
  deal_stage      text,
  is_archived     boolean not null default false,
  archived_at     timestamptz,
  pipeline        text,
  amount          numeric(14,2),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists deals_company_id_idx on deals (company_id);
create index if not exists deals_is_archived_idx on deals (is_archived);

drop trigger if exists trg_deals_updated_at on deals;
create trigger trg_deals_updated_at before update on deals
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- contacts
-- ---------------------------------------------------------------------
create table if not exists contacts (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid references companies(id) on delete cascade,
  full_name          text,
  email              text,
  phone              text,
  role_title         text,
  is_primary_contact boolean not null default false,
  source             contact_source not null default 'manual',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists contacts_company_id_idx on contacts (company_id);
create index if not exists contacts_email_idx on contacts (lower(email));
-- Avoid duplicate contacts per company/email when re-ingesting.
create unique index if not exists contacts_company_email_key
  on contacts (company_id, lower(email)) where email is not null;

drop trigger if exists trg_contacts_updated_at on contacts;
create trigger trg_contacts_updated_at before update on contacts
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- attachments
-- ---------------------------------------------------------------------
create table if not exists attachments (
  id                    uuid primary key default gen_random_uuid(),
  deal_id               uuid references deals(id) on delete cascade,
  hubspot_attachment_id text,
  file_name             text,
  file_url              text,
  source_type           attachment_source not null default 'generic',
  parsed                boolean not null default false,
  parsed_summary        jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists attachments_deal_id_idx on attachments (deal_id);
create unique index if not exists attachments_hubspot_id_key
  on attachments (hubspot_attachment_id) where hubspot_attachment_id is not null;

drop trigger if exists trg_attachments_updated_at on attachments;
create trigger trg_attachments_updated_at before update on attachments
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- kyc_profiles (one per company)
-- ---------------------------------------------------------------------
create table if not exists kyc_profiles (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null unique references companies(id) on delete cascade,
  enriched_data        jsonb,
  primary_website      text,
  linkedin_company_url text,
  other_links          jsonb,
  last_enriched_at     timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists kyc_profiles_company_id_idx on kyc_profiles (company_id);

drop trigger if exists trg_kyc_updated_at on kyc_profiles;
create trigger trg_kyc_updated_at before update on kyc_profiles
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- email_templates
-- ---------------------------------------------------------------------
create table if not exists email_templates (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  industry   text,               -- null = generic template
  subject    text not null,
  body       text not null,      -- supports {{company_name}}, {{contact_name}}, {{industry}}
  from_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists email_templates_industry_idx on email_templates (industry);

drop trigger if exists trg_templates_updated_at on email_templates;
create trigger trg_templates_updated_at before update on email_templates
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- email_sends (queue + history)
-- ---------------------------------------------------------------------
create table if not exists email_sends (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid references companies(id) on delete set null,
  contact_id          uuid references contacts(id) on delete set null,
  template_id         uuid references email_templates(id) on delete set null,
  to_email            text not null,
  subject             text,
  body_rendered       text,
  status              send_status not null default 'queued',
  provider_message_id text,
  provider_url        text,
  cooldown_seconds    integer not null default 2,
  sent_at             timestamptz,
  error_message       text,
  created_by          uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists email_sends_status_idx on email_sends (status);
create index if not exists email_sends_company_id_idx on email_sends (company_id);
create index if not exists email_sends_created_by_idx on email_sends (created_by);
create index if not exists email_sends_sent_at_idx on email_sends (sent_at);

drop trigger if exists trg_email_sends_updated_at on email_sends;
create trigger trg_email_sends_updated_at before update on email_sends
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- user_settings (private per authenticated user — holds secrets/tokens)
-- ---------------------------------------------------------------------
create table if not exists user_settings (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  hubspot_token    text,
  ms_refresh_token text,
  ms_account_email text,
  nvidia_key       text,           -- optional per-user override; else edge env is used
  daily_send_limit integer not null default 500,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

drop trigger if exists trg_user_settings_updated_at on user_settings;
create trigger trg_user_settings_updated_at before update on user_settings
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- Convenience view: companies + primary contact + flags for the dashboard
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
) pc on true;
