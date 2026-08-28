-- Keep low-pressure archival proactive without turning every newly imported
-- attachment into a recovery outage. Imports still serialize with active
-- archive work and remain fail-closed at the 410 MB capacity guard.

create or replace function private.reconcile_storage_compaction_guarded()
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, cron, private
as $$
declare
  sizes record;
  recovery_state public.storage_compaction_state%rowtype;
begin
  select * into sizes from private.storage_relation_sizes();

  if sizes.database_bytes < 410000000 then
    update public.storage_compaction_state
    set state = case when state in ('succeeded', 'failed_closed') then 'succeeded' else 'idle' end,
        requested_at = null,
        scheduled_at = null,
        started_at = null,
        next_retry_at = null,
        attempt_count = 0,
        database_bytes_after = sizes.database_bytes,
        deal_heap_bytes_after = sizes.deal_heap_bytes,
        deal_index_bytes_after = sizes.deal_index_bytes,
        deal_toast_bytes_after = sizes.deal_toast_bytes,
        last_error = null,
        skip_reason = null,
        updated_at = statement_timestamp()
    where id
      and state not in ('scheduled', 'running')
      and (
        state not in ('idle', 'succeeded')
        or requested_at is not null
        or scheduled_at is not null
        or started_at is not null
        or next_retry_at is not null
        or attempt_count <> 0
        or last_error is not null
        or skip_reason is not null
      )
    returning * into recovery_state;

    if found then
      return 'capacity-safe';
    end if;

    select * into recovery_state
    from public.storage_compaction_state
    where id;

    if recovery_state.state not in ('scheduled', 'running') then
      return 'capacity-safe';
    end if;
  end if;

  return private.reconcile_storage_compaction();
end;
$$;

revoke all on function private.reconcile_storage_compaction_guarded()
  from public, anon, authenticated;

create or replace function public.claim_storage_import_admission(
  p_owner_id uuid,
  p_lease_seconds integer default 300
)
returns table (
  decision text,
  database_bytes bigint,
  limit_bytes bigint,
  archive_pending boolean,
  compaction_state text,
  reason text,
  lease_token uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  used_bytes bigint;
  global_pending boolean := false;
  archive_state public.storage_archive_state%rowtype;
  recovery_state public.storage_compaction_state%rowtype;
  import_state public.storage_import_state%rowtype;
  claimed_token uuid;
begin
  if p_owner_id is null then
    return query select 'status_unavailable', 0::bigint, 500000000::bigint, false,
      'idle', 'owner-unavailable', null::uuid;
    return;
  end if;

  select * into archive_state
  from public.storage_archive_state
  where id
  for update;

  select * into recovery_state
  from public.storage_compaction_state
  where id
  for update;

  select * into import_state
  from public.storage_import_state
  where id
  for update;

  used_bytes := pg_catalog.pg_database_size(pg_catalog.current_database());
  if used_bytes >= 410000000 then
    select exists (
      select 1 from public.storage_archive_owner_candidates()
    ) into global_pending;
  end if;

  if archive_state.id is null or recovery_state.id is null or import_state.id is null then
    return query select 'status_unavailable', used_bytes, 500000000::bigint, global_pending,
      coalesce(recovery_state.state, 'idle'), 'recovery-state-unavailable', null::uuid;
  elsif not recovery_state.controller_enabled then
    return query select 'status_unavailable', used_bytes, 500000000::bigint, global_pending,
      recovery_state.state, 'controller-disabled', null::uuid;
  elsif recovery_state.state in ('scheduled', 'running', 'retry_wait') then
    return query select 'compacting', used_bytes, 500000000::bigint, global_pending,
      recovery_state.state, recovery_state.state, null::uuid;
  elsif recovery_state.state = 'failed_closed' then
    return query select 'capacity_guard', used_bytes, 500000000::bigint, global_pending,
      recovery_state.state, 'failed-closed', null::uuid;
  elsif archive_state.lease_expires_at is not null
     and archive_state.lease_expires_at >= statement_timestamp() then
    return query select 'archiving', used_bytes, 500000000::bigint, global_pending,
      recovery_state.state, 'archive-active', null::uuid;
  elsif import_state.lease_expires_at is not null
     and import_state.lease_expires_at >= statement_timestamp() then
    return query select 'status_unavailable', used_bytes, 500000000::bigint, global_pending,
      recovery_state.state, 'import-lease-active', null::uuid;
  elsif global_pending and used_bytes >= 410000000 then
    return query select 'archiving', used_bytes, 500000000::bigint, true,
      recovery_state.state, 'archive-pending', null::uuid;
  elsif used_bytes >= 410000000 then
    return query select 'capacity_guard', used_bytes, 500000000::bigint, global_pending,
      recovery_state.state, 'capacity', null::uuid;
  end if;

  if recovery_state.state = 'cooldown' then
    update public.storage_compaction_state
    set state = 'idle',
        requested_at = null,
        scheduled_at = null,
        started_at = null,
        next_retry_at = null,
        attempt_count = 0,
        last_error = null,
        skip_reason = null,
        updated_at = statement_timestamp()
    where id
    returning * into recovery_state;
  end if;

  claimed_token := gen_random_uuid();
  update public.storage_import_state
  set owner_id = p_owner_id,
      lease_token = claimed_token,
      lease_expires_at = statement_timestamp()
        + make_interval(secs => greatest(300, least(p_lease_seconds, 300)))
  where id;

  return query select 'allowed', used_bytes, 500000000::bigint, false,
    recovery_state.state, null::text, claimed_token;
exception
  when others then
    return query select 'status_unavailable', 0::bigint, 500000000::bigint, false,
      'idle', 'admission-check-failed', null::uuid;
end;
$$;

revoke all on function public.claim_storage_import_admission(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.claim_storage_import_admission(uuid, integer)
  to service_role;

do $$
declare
  archive_job record;
begin
  select jobid, command into archive_job
  from cron.job
  where jobname = 'storage-pressure-r2-archive';

  if archive_job.jobid is null then
    raise exception 'storage recovery cron job is absent.';
  elsif archive_job.command like '%private.reconcile_storage_compaction_guarded()%' then
    null;
  elsif archive_job.command like '%private.reconcile_storage_compaction()%' then
    perform cron.alter_job(
      archive_job.jobid,
      command := replace(
        archive_job.command,
        'private.reconcile_storage_compaction()',
        'private.reconcile_storage_compaction_guarded()'
      )
    );
  else
    raise exception 'storage recovery cron command is not recognized; refusing a partial safety deployment.';
  end if;

  perform private.reconcile_storage_compaction_guarded();
end;
$$;

comment on function private.reconcile_storage_compaction_guarded() is
  'Checks safe capacity before import-lease cooldown and delegates real recovery to the serialized controller.';
comment on function public.claim_storage_import_admission(uuid, integer) is
  'Service-role-only atomic admission: low-pressure backlog archives in the background; active work and capacity recovery remain fail-closed.';
