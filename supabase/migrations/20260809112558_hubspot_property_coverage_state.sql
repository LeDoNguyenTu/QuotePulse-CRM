-- Track value coverage in the small property catalogue. Expanding every JSON
-- snapshot at dashboard read time timed out once the account reached ~185k deals.
alter table public.hubspot_property_catalog
  add column if not exists has_value boolean not null default false;

create index if not exists hubspot_property_catalog_value_coverage_idx
  on public.hubspot_property_catalog (owner_id, object_type, property_name)
  where has_value;

-- Fast probe used when a schema-versioned property sweep was marked complete but
-- a failed database write may have left one or more historic rows behind.
create index if not exists deals_owner_property_schema_idx
  on public.deals (owner_id, hubspot_properties_schema_version)
  where hubspot_deal_id is not null;

create or replace function public.hubspot_property_names_with_values(
  p_object_type text default 'companies'
)
returns table (property_name text)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select catalog.property_name
  from public.hubspot_property_catalog as catalog
  where catalog.owner_id = auth.uid()
    and catalog.object_type = p_object_type
    and catalog.has_value
  order by catalog.display_order nulls last, catalog.property_name;
$$;

revoke all on function public.hubspot_property_names_with_values(text) from public, anon;
grant execute on function public.hubspot_property_names_with_values(text) to authenticated;

-- Apply one HubSpot page in one statement. This function is intentionally not a
-- browser API: only the service-role Edge Function can call it, and the update
-- still requires the explicit owner and HubSpot IDs supplied by the caller.
create or replace function public.apply_hubspot_deal_property_snapshots(
  p_owner_id uuid,
  p_schema_version text,
  p_rows jsonb
)
returns integer
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  affected integer;
begin
  update public.deals as deal
  set hubspot_properties = coalesce(deal.hubspot_properties, '{}'::jsonb)
        || coalesce(snapshot.properties, '{}'::jsonb),
      hubspot_properties_schema_version = p_schema_version
  from jsonb_to_recordset(p_rows) as snapshot(hubspot_deal_id text, properties jsonb)
  where deal.owner_id = p_owner_id
    and deal.hubspot_deal_id = snapshot.hubspot_deal_id;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.apply_hubspot_deal_property_snapshots(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_hubspot_deal_property_snapshots(uuid, text, jsonb)
  to service_role;

-- The active repair stream must not be restarted by recycle-bin rows. Archived
-- deals are refreshed by the independent archived HubSpot sweep.
create or replace function public.hubspot_deal_property_backfill_needed(
  p_owner_id uuid,
  p_schema_version text
)
returns boolean
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select exists (
    select 1
    from public.deals as deal
    where deal.owner_id = p_owner_id
      and deal.hubspot_deal_id is not null
      and not deal.is_archived
      and deal.hubspot_properties_schema_version is distinct from p_schema_version
  );
$$;

revoke all on function public.hubspot_deal_property_backfill_needed(uuid, text)
  from public, anon, authenticated;
grant execute on function public.hubspot_deal_property_backfill_needed(uuid, text)
  to service_role;
