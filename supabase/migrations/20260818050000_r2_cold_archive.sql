-- Cold archive pointers keep Postgres as the CRM's relational source of truth
-- while moving bulky, reconstructable HubSpot snapshots to private R2.
alter table public.deals
  add column if not exists r2_archive_key text,
  add column if not exists r2_archive_sha256 text,
  add column if not exists r2_archived_at timestamptz;

create table if not exists public.company_attachment_archives (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  r2_key text not null,
  r2_sha256 text not null,
  item_count integer not null check (item_count >= 0),
  archived_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, company_id)
);

create index if not exists company_attachment_archives_owner_company_idx
  on public.company_attachment_archives (owner_id, company_id);

alter table public.company_attachment_archives enable row level security;
revoke all on table public.company_attachment_archives from anon, authenticated;
grant all on table public.company_attachment_archives to service_role;

create index if not exists deals_r2_archive_pending_idx
  on public.deals (owner_id, id)
  where r2_archive_key is null and hubspot_properties is not null
    and hubspot_properties <> '{}'::jsonb;

create or replace function public.deal_archive_candidates(p_owner_id uuid, p_limit integer)
returns table (
  id uuid,
  hubspot_deal_id text,
  hubspot_modified_at timestamptz,
  hubspot_properties jsonb
)
language sql
stable
security invoker
set search_path = public
as $$
  select deal.id, deal.hubspot_deal_id, deal.hubspot_modified_at, deal.hubspot_properties
  from public.deals deal
  where deal.owner_id = p_owner_id
    and deal.r2_archive_key is null
    and deal.hubspot_properties is not null
    and deal.hubspot_properties <> '{}'::jsonb
  order by deal.id
  limit greatest(1, least(p_limit, 1000));
$$;

revoke all on function public.deal_archive_candidates(uuid, integer) from public;
grant execute on function public.deal_archive_candidates(uuid, integer) to service_role;

create or replace function public.generic_attachment_archive_candidates(p_owner_id uuid, p_limit integer)
returns table (company_id uuid)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct deal.company_id
  from public.attachments attachment
  join public.deals deal
    on deal.id = attachment.deal_id and deal.owner_id = attachment.owner_id
  where attachment.owner_id = p_owner_id
    and attachment.source_type = 'generic'
    and deal.company_id is not null
  order by deal.company_id
  limit greatest(1, least(p_limit, 500));
$$;

revoke all on function public.generic_attachment_archive_candidates(uuid, integer) from public;
grant execute on function public.generic_attachment_archive_candidates(uuid, integer) to service_role;

create or replace function public.generic_attachments_for_archive(p_owner_id uuid, p_company_ids uuid[])
returns table (
  id uuid,
  deal_id uuid,
  hubspot_attachment_id text,
  file_name text,
  file_url text,
  source_type text,
  parsed boolean,
  parsed_summary jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  company_id uuid
)
language sql
stable
security invoker
set search_path = public
as $$
  select attachment.id, attachment.deal_id, attachment.hubspot_attachment_id,
    attachment.file_name, attachment.file_url, attachment.source_type::text,
    attachment.parsed, attachment.parsed_summary, attachment.created_at,
    attachment.updated_at, deal.company_id
  from public.attachments attachment
  join public.deals deal
    on deal.id = attachment.deal_id and deal.owner_id = attachment.owner_id
  where attachment.owner_id = p_owner_id
    and attachment.source_type = 'generic'
    and deal.company_id = any(p_company_ids);
$$;

revoke all on function public.generic_attachments_for_archive(uuid, uuid[]) from public;
grant execute on function public.generic_attachments_for_archive(uuid, uuid[]) to service_role;

create or replace function public.finalize_company_attachment_archive_batch(
  p_owner_id uuid,
  p_r2_key text,
  p_r2_sha256 text,
  p_companies jsonb
) returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  company record;
  current_sha256 text;
  current_exists boolean;
  removed integer;
begin
  -- Advisory locks also serialize the first writer, when no manifest row exists
  -- yet and SELECT FOR UPDATE would otherwise have nothing to lock.
  for company in
    select * from jsonb_to_recordset(p_companies) as row(
      company_id uuid,
      expected_sha256 text,
      item_count integer,
      attachment_ids jsonb
    ) order by company_id
  loop
    perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text || ':' || company.company_id::text, 0));
    current_sha256 := null;
    select manifest.r2_sha256 into current_sha256
    from public.company_attachment_archives manifest
    where manifest.owner_id = p_owner_id and manifest.company_id = company.company_id;
    current_exists := found;
    if (current_exists and current_sha256 is distinct from company.expected_sha256)
       or (not current_exists and company.expected_sha256 is not null) then
      raise exception 'attachment archive changed concurrently';
    end if;
  end loop;

  insert into public.company_attachment_archives
    (owner_id, company_id, r2_key, r2_sha256, item_count, archived_at, updated_at)
  select p_owner_id, row.company_id, p_r2_key, p_r2_sha256, row.item_count, now(), now()
  from jsonb_to_recordset(p_companies) as row(
    company_id uuid,
    expected_sha256 text,
    item_count integer,
    attachment_ids jsonb
  )
  on conflict (owner_id, company_id) do update set
    r2_key = excluded.r2_key,
    r2_sha256 = excluded.r2_sha256,
    item_count = excluded.item_count,
    archived_at = excluded.archived_at,
    updated_at = excluded.updated_at;

  with incoming as (
    select row.company_id, ids.attachment_id::uuid as attachment_id
    from jsonb_to_recordset(p_companies) as row(
      company_id uuid,
      expected_sha256 text,
      item_count integer,
      attachment_ids jsonb
    )
    cross join lateral jsonb_array_elements_text(row.attachment_ids) as ids(attachment_id)
  )
  delete from public.attachments attachment
  using public.deals deal, incoming
  where attachment.id = incoming.attachment_id
    and attachment.owner_id = p_owner_id
    and attachment.source_type = 'generic'
    and attachment.deal_id = deal.id
    and deal.owner_id = p_owner_id
    and deal.company_id = incoming.company_id;
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.finalize_company_attachment_archive_batch(uuid, text, text, jsonb) from public;
grant execute on function public.finalize_company_attachment_archive_batch(uuid, text, text, jsonb) to service_role;

-- Clear a freshly ingested snapshot only if it is still the exact version that
-- was uploaded. This prevents a slower R2 write from erasing a newer sync.
create or replace function public.finalize_deal_archive(
  p_owner_id uuid,
  p_deal_id uuid,
  p_expected_modified_at timestamptz,
  p_expected_properties jsonb,
  p_r2_key text,
  p_r2_sha256 text
) returns boolean
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.deals
  set hubspot_properties = '{}'::jsonb,
      r2_archive_key = p_r2_key,
      r2_archive_sha256 = p_r2_sha256,
      r2_archived_at = now()
  where id = p_deal_id
    and owner_id = p_owner_id
    and hubspot_modified_at is not distinct from p_expected_modified_at
    and hubspot_properties = p_expected_properties;
  return found;
end;
$$;

revoke all on function public.finalize_deal_archive(uuid, uuid, timestamptz, jsonb, text, text) from public;
grant execute on function public.finalize_deal_archive(uuid, uuid, timestamptz, jsonb, text, text) to service_role;

-- Historical migration uses one compressed R2 object for a whole page. Besides
-- being much faster, this also lets read-through fetch one object per UI page.
create or replace function public.finalize_deal_archive_batch(
  p_owner_id uuid,
  p_r2_key text,
  p_r2_sha256 text,
  p_rows jsonb
) returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  archived integer;
begin
  with incoming as (
    select *
    from jsonb_to_recordset(p_rows) as row(
      id uuid,
      hubspot_deal_id text,
      expected_modified_at timestamptz,
      properties jsonb
    )
  ), updated as (
    update public.deals deal
    set hubspot_properties = '{}'::jsonb,
        r2_archive_key = p_r2_key,
        r2_archive_sha256 = p_r2_sha256,
        r2_archived_at = now()
    from incoming
    where deal.id = incoming.id
      and deal.owner_id = p_owner_id
      and deal.hubspot_deal_id = incoming.hubspot_deal_id
      and deal.hubspot_modified_at is not distinct from incoming.expected_modified_at
      and deal.hubspot_properties = incoming.properties
    returning deal.id
  )
  select count(*) into archived from updated;
  return archived;
end;
$$;

revoke all on function public.finalize_deal_archive_batch(uuid, text, text, jsonb) from public;
grant execute on function public.finalize_deal_archive_batch(uuid, text, text, jsonb) to service_role;

-- Property repair also creates a fresh snapshot. Invalidate any older R2
-- pointer so the archive worker will persist the merged replacement.
create or replace function public.apply_hubspot_deal_property_snapshots(
  p_owner_id uuid,
  p_schema_version text,
  p_rows jsonb
) returns integer
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
      hubspot_properties_schema_version = p_schema_version,
      r2_archive_key = null,
      r2_archive_sha256 = null,
      r2_archived_at = null
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
