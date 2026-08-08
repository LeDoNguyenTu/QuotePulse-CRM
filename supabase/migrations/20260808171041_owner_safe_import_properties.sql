-- Preserve every readable HubSpot property alongside the normalized fields that
-- power existing filters and sorting. These snapshots are private to the owner.
alter table public.companies add column if not exists hubspot_properties jsonb not null default '{}'::jsonb;
alter table public.deals add column if not exists hubspot_properties jsonb not null default '{}'::jsonb;
alter table public.contacts add column if not exists hubspot_properties jsonb not null default '{}'::jsonb;
alter table public.companies add column if not exists hubspot_properties_schema_version text;
alter table public.deals add column if not exists hubspot_properties_schema_version text;
alter table public.contacts add column if not exists hubspot_properties_schema_version text;

-- Each account can keep its own visible-column set without exposing it to other
-- users or relying on browser-local storage.
alter table public.user_settings
  add column if not exists table_column_preferences jsonb not null default '{}'::jsonb;

create table if not exists public.hubspot_property_catalog (
  owner_id uuid not null references auth.users(id) on delete cascade,
  object_type text not null check (object_type in ('companies', 'deals', 'contacts')),
  property_name text not null,
  label text not null,
  data_type text,
  field_type text,
  group_name text,
  display_order integer,
  hubspot_defined boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (owner_id, object_type, property_name)
);

alter table public.hubspot_property_catalog enable row level security;

drop policy if exists "hubspot_property_catalog_owner" on public.hubspot_property_catalog;
create policy "hubspot_property_catalog_owner" on public.hubspot_property_catalog
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop trigger if exists trg_hubspot_property_catalog_updated_at on public.hubspot_property_catalog;
create trigger trg_hubspot_property_catalog_updated_at
  before update on public.hubspot_property_catalog
  for each row execute function public.set_updated_at();

create index if not exists hubspot_property_catalog_owner_object_idx
  on public.hubspot_property_catalog (owner_id, object_type, display_order, property_name);
