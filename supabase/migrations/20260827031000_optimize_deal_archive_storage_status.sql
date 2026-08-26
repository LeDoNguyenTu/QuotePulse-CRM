-- Keep the recovery status endpoint inside the Free-plan statement budget.
-- The pending branch deliberately matches deals_r2_archive_pending_idx. The
-- previous FILTER aggregate inspected every large hubspot_properties value and
-- timed out while the archive was actively rewriting the table.

create or replace function public.deal_archive_storage_status(p_owner_id uuid)
returns table (
  total_deals bigint,
  pending_snapshots bigint,
  archived_snapshots bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with pending_count as (
    select count(*) as value
    from public.deals deal
    where deal.owner_id = p_owner_id
      and deal.r2_archive_key is null
      and deal.hubspot_properties is not null
      and deal.hubspot_properties <> '{}'::jsonb
  )
  select
    value as total_deals,
    value as pending_snapshots,
    0::bigint as archived_snapshots
  from pending_count;
$$;

revoke all on function public.deal_archive_storage_status(uuid)
  from public, anon, authenticated;
grant execute on function public.deal_archive_storage_status(uuid)
  to service_role;

comment on function public.deal_archive_storage_status(uuid) is
  'Reports the exact owner-scoped pending R2 workload. Compatibility total_deals mirrors pending_snapshots; archived_snapshots is not scanned.';
