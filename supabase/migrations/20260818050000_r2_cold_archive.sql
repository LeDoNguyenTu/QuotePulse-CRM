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

create policy "Owners manage their attachment archive manifests"
  on public.company_attachment_archives for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create or replace function public.delete_verified_generic_attachments(
  p_owner_id uuid,
  p_company_id uuid,
  p_r2_key text,
  p_r2_sha256 text
) returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  removed integer;
begin
  if not exists (
    select 1 from public.company_attachment_archives manifest
    where manifest.owner_id = p_owner_id
      and manifest.company_id = p_company_id
      and manifest.r2_key = p_r2_key
      and manifest.r2_sha256 = p_r2_sha256
  ) then
    raise exception 'verified attachment archive manifest not found';
  end if;

  delete from public.attachments attachment
  using public.deals deal
  where attachment.owner_id = p_owner_id
    and attachment.owner_id = deal.owner_id
    and attachment.deal_id = deal.id
    and deal.company_id = p_company_id
    and attachment.source_type = 'generic';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.delete_verified_generic_attachments(uuid, uuid, text, text) from public;
grant execute on function public.delete_verified_generic_attachments(uuid, uuid, text, text) to authenticated, service_role;
