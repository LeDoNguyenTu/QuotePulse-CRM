\set ON_ERROR_STOP on
\echo 'QuotePulse Supabase storage recovery preflight'

-- The archive must be logically complete before a physical rewrite can discard
-- dead TOAST pages. Partial pointer metadata is also treated as unsafe.
select
  count(*) filter (
    where coalesce(deal.hubspot_properties, '{}'::jsonb) <> '{}'::jsonb
  ) as hot_snapshot_count,
  count(*) filter (
    where (deal.r2_archive_key is null and (
      deal.r2_archive_sha256 is not null or deal.r2_archived_at is not null
    )) or (deal.r2_archive_key is not null and (
      deal.r2_archive_sha256 is null or deal.r2_archived_at is null
    ))
  ) as incomplete_pointer_count,
  case when count(*) filter (
    where coalesce(deal.hubspot_properties, '{}'::jsonb) <> '{}'::jsonb
  ) = 0 and count(*) filter (
    where (deal.r2_archive_key is null and (
      deal.r2_archive_sha256 is not null or deal.r2_archived_at is not null
    )) or (deal.r2_archive_key is not null and (
      deal.r2_archive_sha256 is null or deal.r2_archived_at is null
    ))
  ) = 0 then 'true' else 'false' end as snapshots_ready
from public.deals deal
\gset recovery_

\if :recovery_snapshots_ready
  \echo 'Archive metadata preflight passed.'
\else
  \echo 'STOP: R2 archive is incomplete. Hot snapshots:' :recovery_hot_snapshot_count 'incomplete pointers:' :recovery_incomplete_pointer_count
  \quit 3
\endif

select case when current_setting('default_transaction_read_only') = 'off'
    and not pg_is_in_recovery()
  then 'true' else 'false' end as database_writable
\gset recovery_

\if :recovery_database_writable
  \echo 'Database writable preflight passed.'
\else
  \echo 'STOP: database is read-only or in recovery.'
  \quit 3
\endif

select case when not exists (
    select 1
    from pg_stat_activity activity
    where activity.pid <> pg_backend_pid()
      and activity.state <> 'idle'
      and activity.query ~* '(insert[[:space:]]+into|update|delete[[:space:]]+from)[[:space:][:print:]]*(deals|sync_state|storage_archive)'
  ) then 'true' else 'false' end as no_active_writers
\gset recovery_

\if :recovery_no_active_writers
  \echo 'Active writer preflight passed.'
\else
  \echo 'STOP: a HubSpot or archive database writer is active.'
  \quit 3
\endif

select case when not exists (
    select 1
    from public.storage_archive_state state
    where state.id and state.lease_expires_at > now()
  ) then 'true' else 'false' end as no_archive_lease
\gset recovery_

\if :recovery_no_archive_lease
  \echo 'Archive lease preflight passed.'
\else
  \echo 'STOP: the R2 archive worker still holds an active lease.'
  \quit 3
\endif

-- Free projects have a 1 GB physical disk. Account for database relations and
-- WAL, then require 35% overhead plus 75 MB beyond the logical deals rewrite
-- and current index footprint. Abort rather than risk filling the disk.
with wal as (
  select coalesce(sum(entry.size), 0)::bigint as bytes
  from pg_ls_waldir() entry
), logical_deals as (
  select coalesce(sum(pg_column_size(deal)), 0)::bigint as bytes
  from public.deals deal
), sizes as (
  select
    pg_database_size(current_database())::bigint as database_bytes,
    wal.bytes as wal_bytes,
    pg_total_relation_size('public.deals'::regclass)::bigint as deals_relation_bytes,
    logical_deals.bytes as deals_logical_bytes,
    pg_indexes_size('public.deals'::regclass)::bigint as deals_index_bytes
  from wal cross join logical_deals
)
select
  sizes.*,
  greatest(0::bigint, 1000000000::bigint - sizes.database_bytes - sizes.wal_bytes) as estimated_free_bytes,
  ceil((sizes.deals_logical_bytes + sizes.deals_index_bytes) * 1.35)::bigint + 75000000::bigint as required_headroom_bytes,
  case when greatest(0::bigint, 1000000000::bigint - sizes.database_bytes - sizes.wal_bytes)
      > ceil((sizes.deals_logical_bytes + sizes.deals_index_bytes) * 1.35)::bigint + 75000000::bigint
    then 'true' else 'false' end as headroom_ready
from sizes
\gset recovery_

select
  pg_size_pretty(:'recovery_database_bytes'::bigint) as database_size,
  pg_size_pretty(:'recovery_wal_bytes'::bigint) as wal_size,
  pg_size_pretty(:'recovery_deals_relation_bytes'::bigint) as deals_relation_size,
  pg_size_pretty(:'recovery_deals_logical_bytes'::bigint) as deals_logical_size,
  pg_size_pretty(:'recovery_estimated_free_bytes'::bigint) as estimated_free,
  pg_size_pretty(:'recovery_required_headroom_bytes'::bigint) as required_headroom;

\if :recovery_headroom_ready
  \echo 'Temporary headroom preflight passed.'
\else
  \echo 'STOP: insufficient temporary headroom. Wait for WAL to settle and retry during a quiet window.'
  \quit 3
\endif

\echo 'All guards passed. Compacting public.deals; imports must remain paused.'
checkpoint;
vacuum (full, analyze) public.deals;

select
  pg_database_size(current_database())::bigint as final_database_bytes,
  case when pg_database_size(current_database()) < 500000000
    then 'true' else 'false' end as below_quota
\gset recovery_

select pg_size_pretty(:'recovery_final_database_bytes'::bigint) as final_database_size;

\if :recovery_below_quota
  \echo 'Recovery succeeded: Supabase database is below 500,000,000 bytes.'
\else
  \echo 'STOP: compaction completed but the database is still at or above 500,000,000 bytes.'
  \quit 4
\endif
