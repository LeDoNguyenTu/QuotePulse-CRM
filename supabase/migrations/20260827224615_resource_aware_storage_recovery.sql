-- Resource-aware storage recovery policy (500,000,000 byte application limit):
-- archive begins at 300000000, accelerates at 375000000, imports stop and
-- compaction becomes eligible at 410000000, and 475000000 permits the next
-- quiet opportunity outside the normal maintenance window.

alter table public.storage_archive_runs
  drop constraint if exists storage_archive_runs_pressure_check;
alter table public.storage_archive_runs
  add constraint storage_archive_runs_pressure_check
  check (pressure in ('warning', 'high', 'critical'));

insert into public.storage_archive_state (id)
values (true)
on conflict (id) do nothing;

alter table public.storage_archive_state
  add column if not exists last_owner_id uuid,
  add column if not exists last_archive_work_at timestamptz,
  add column if not exists zero_candidate_observations integer not null default 0
    check (zero_candidate_observations between 0 and 2);

-- Existing installations did not track the last write on the singleton. Keep
-- the first controller run conservative: use the newest known productive run,
-- or migration time when history is empty or ambiguous.
update public.storage_archive_state state
set last_archive_work_at = coalesce(
  state.last_archive_work_at,
  (
    select max(run.finished_at)
    from public.storage_archive_runs run
    where run.deals_archived > 0 or run.generic_attachments_archived > 0
  ),
  statement_timestamp()
)
where state.id;

create table if not exists public.storage_import_state (
  id boolean primary key default true check (id),
  owner_id uuid,
  lease_token uuid,
  lease_expires_at timestamptz
);

alter table public.storage_import_state enable row level security;
revoke all on table public.storage_import_state from public, anon, authenticated;
grant all on table public.storage_import_state to service_role;

insert into public.storage_import_state (id)
values (true)
on conflict (id) do nothing;

-- Keep the once-per-minute global attachment backlog probe on a small partial
-- index as this table grows. The predicate exactly matches archive candidates.
create index if not exists attachments_generic_archive_pending_idx
  on public.attachments (owner_id, deal_id, id)
  where source_type = 'generic';

create or replace function public.storage_archive_owner_candidates()
returns table (owner_id uuid)
language sql
stable
security invoker
set search_path = public
as $$
  with candidates as (
    select deal.owner_id
    from public.deals deal
    where deal.r2_archive_key is null
      and deal.hubspot_properties is not null
      and deal.hubspot_properties <> '{}'::jsonb
    union
    select attachment.owner_id
    from public.attachments attachment
    join public.deals deal
      on deal.id = attachment.deal_id
     and deal.owner_id = attachment.owner_id
    where attachment.source_type = 'generic'
      and deal.company_id is not null
  ), cursor_state as (
    select state.last_owner_id
    from public.storage_archive_state state
    where state.id
  )
  select candidate.owner_id
  from candidates candidate
  cross join cursor_state state
  order by
    case
      when state.last_owner_id is null or candidate.owner_id > state.last_owner_id then 0
      else 1
    end,
    candidate.owner_id
  limit 1;
$$;

revoke all on function public.storage_archive_owner_candidates()
  from public, anon, authenticated;
grant execute on function public.storage_archive_owner_candidates()
  to service_role;

create or replace function public.complete_storage_archive_owner_attempt(
  p_owner_id uuid,
  p_did_work boolean
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.storage_archive_state
  set last_owner_id = p_owner_id,
      last_archive_work_at = case
        when p_did_work then statement_timestamp()
        else last_archive_work_at
      end,
      zero_candidate_observations = case
        when p_did_work then 0
        else zero_candidate_observations
      end
  where id;
end;
$$;

revoke all on function public.complete_storage_archive_owner_attempt(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.complete_storage_archive_owner_attempt(uuid, boolean)
  to service_role;

create or replace function public.generic_attachments_for_archive(
  p_owner_id uuid,
  p_company_ids uuid[],
  p_limit integer
)
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
    and deal.company_id = any(p_company_ids)
  order by attachment.id
  limit greatest(1, least(p_limit, 1000));
$$;

revoke all on function public.generic_attachments_for_archive(uuid, uuid[], integer)
  from public, anon, authenticated;
grant execute on function public.generic_attachments_for_archive(uuid, uuid[], integer)
  to service_role;

-- Archive finalization and the cooldown marker must commit atomically. If a
-- later R2 batch step fails, the controller still sees the rows reclaimed by
-- the earlier successful finalization and waits ten minutes before compaction.
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

  if archived > 0 then
    update public.storage_archive_state
    set last_archive_work_at = statement_timestamp(),
        zero_candidate_observations = 0
    where id;
  end if;

  return archived;
end;
$$;

revoke all on function public.finalize_deal_archive_batch(uuid, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.finalize_deal_archive_batch(uuid, text, text, jsonb)
  to service_role;

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

  if removed > 0 then
    update public.storage_archive_state
    set last_archive_work_at = statement_timestamp(),
        zero_candidate_observations = 0
    where id;
  end if;

  return removed;
end;
$$;

revoke all on function public.finalize_company_attachment_archive_batch(uuid, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.finalize_company_attachment_archive_batch(uuid, text, text, jsonb)
  to service_role;

create table if not exists public.storage_compaction_state (
  id boolean primary key default true check (id),
  controller_enabled boolean not null default false,
  state text not null default 'idle'
    check (state in ('idle', 'cooldown', 'scheduled', 'running', 'retry_wait', 'succeeded', 'failed_closed')),
  requested_at timestamptz,
  scheduled_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  next_retry_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  cron_job_id bigint,
  database_bytes_before bigint,
  database_bytes_after bigint,
  deal_heap_bytes_before bigint,
  deal_heap_bytes_after bigint,
  deal_index_bytes_before bigint,
  deal_index_bytes_after bigint,
  deal_toast_bytes_before bigint,
  deal_toast_bytes_after bigint,
  last_error text,
  skip_reason text,
  updated_at timestamptz not null default now()
);

alter table public.storage_compaction_state enable row level security;
revoke all on table public.storage_compaction_state from public, anon, authenticated;
grant all on table public.storage_compaction_state to service_role;

insert into public.storage_compaction_state (id, state)
values (true, 'idle')
on conflict (id) do nothing;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.storage_relation_sizes()
returns table (
  database_bytes bigint,
  deal_heap_bytes bigint,
  deal_index_bytes bigint,
  deal_toast_bytes bigint
)
language sql
stable
security definer
set search_path = pg_catalog, public, extensions, cron, private
as $$
  select
    pg_catalog.pg_database_size(pg_catalog.current_database())::bigint,
    pg_catalog.pg_relation_size('public.deals'::regclass)::bigint,
    pg_catalog.pg_indexes_size('public.deals'::regclass)::bigint,
    coalesce(
      pg_catalog.pg_total_relation_size(
        nullif(
          (select relation.reltoastrelid from pg_catalog.pg_class relation where relation.oid = 'public.deals'::regclass),
          0::oid
        )
      ),
      0
    )::bigint;
$$;

revoke all on function private.storage_relation_sizes() from public, anon, authenticated;

create or replace function private.storage_compaction_backoff(p_attempt integer)
returns interval
language sql
immutable
security definer
set search_path = pg_catalog, public, extensions, cron, private
as $$
  select case
    when p_attempt <= 1 then interval '15 minutes'
    when p_attempt = 2 then interval '30 minutes'
    else interval '60 minutes'
  end;
$$;

revoke all on function private.storage_compaction_backoff(integer) from public, anon, authenticated;

-- pg_cron opens a new session for each run. Scope a short lock timeout to the
-- exact cron role in this database while the one-shot job is armed; app roles
-- and existing sessions are unaffected. VACUUM itself must remain a single
-- top-level command because VACUUM FULL cannot run inside a transaction block.
create or replace function private.set_storage_compaction_lock_timeout(
  p_job_id bigint,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, cron, private
as $$
declare
  job_username text;
begin
  select job.username into job_username
  from cron.job job
  where job.jobid = p_job_id;

  if job_username is null then
    raise exception 'Storage compaction cron role is unavailable.';
  end if;

  if p_enabled then
    execute pg_catalog.format(
      'alter role %I in database %I set lock_timeout = %L',
      job_username,
      pg_catalog.current_database(),
      '5s'
    );
  else
    execute pg_catalog.format(
      'alter role %I in database %I reset lock_timeout',
      job_username,
      pg_catalog.current_database()
    );
  end if;
end;
$$;

revoke all on function private.set_storage_compaction_lock_timeout(bigint, boolean)
  from public, anon, authenticated;

create or replace function private.reconcile_storage_compaction()
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, cron, private
as $$
declare
  current_state public.storage_compaction_state%rowtype;
  archive_state public.storage_archive_state%rowtype;
  import_state public.storage_import_state%rowtype;
  sizes record;
  archive_pending boolean;
  active_query boolean;
  long_transaction boolean;
  maintenance_active boolean;
  compaction_backend_active boolean;
  cron_job_active boolean;
  was_compaction_active boolean := false;
  controller_error text;
  latest_run record;
  deal_toast_oid oid;
  next_minute timestamptz;
  schedule_expression text;
  singapore_hour integer;
begin
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtext('quotepulse.storage-compaction')) then
    return 'controller-busy';
  end if;

  select * into archive_state
  from public.storage_archive_state
  where id
  for update;

  select * into current_state
  from public.storage_compaction_state
  where id
  for update;

  was_compaction_active := current_state.state in ('scheduled', 'running');

  select * into import_state
  from public.storage_import_state
  where id
  for update;

  if not current_state.controller_enabled then
    return 'controller-disabled';
  end if;

  select * into sizes from private.storage_relation_sizes();

  select exists (
    select 1 from public.storage_archive_owner_candidates()
  ) into archive_pending;

  update public.storage_archive_state
  set zero_candidate_observations = case
    when archive_pending then 0
    else least(2, zero_candidate_observations + 1)
  end
  where id
  returning * into archive_state;

  if current_state.state not in ('scheduled', 'running')
     and import_state.lease_expires_at is not null
     and import_state.lease_expires_at >= statement_timestamp() then
    update public.storage_compaction_state
    set state = 'cooldown',
        next_retry_at = import_state.lease_expires_at,
        skip_reason = 'import-lease-active',
        updated_at = statement_timestamp()
    where id;
    return 'import-lease-active';
  end if;

  if current_state.state in ('scheduled', 'running') and current_state.cron_job_id is not null then
    select detail.status, detail.start_time, detail.end_time, detail.return_message
    into latest_run
    from cron.job_run_details detail
    where detail.jobid = current_state.cron_job_id
      and detail.start_time >= current_state.scheduled_at - interval '1 minute'
    order by detail.start_time desc
    limit 1;

    if latest_run.status = 'running' then
      update public.storage_compaction_state
      set state = 'running',
          started_at = coalesce(started_at, latest_run.start_time),
          skip_reason = null,
          updated_at = statement_timestamp()
      where id;
      return 'running';
    end if;

    if latest_run.status in ('succeeded', 'failed') then
      perform cron.alter_job(current_state.cron_job_id, active := false);
      perform private.set_storage_compaction_lock_timeout(current_state.cron_job_id, false);
      select * into sizes from private.storage_relation_sizes();

      if latest_run.status = 'succeeded' and sizes.database_bytes < 410000000 then
        update public.storage_compaction_state
        set state = 'succeeded',
            finished_at = coalesce(latest_run.end_time, statement_timestamp()),
            next_retry_at = null,
            database_bytes_after = sizes.database_bytes,
            deal_heap_bytes_after = sizes.deal_heap_bytes,
            deal_index_bytes_after = sizes.deal_index_bytes,
            deal_toast_bytes_after = sizes.deal_toast_bytes,
            last_error = null,
            skip_reason = null,
            updated_at = statement_timestamp()
        where id;
        return 'succeeded';
      elsif latest_run.status = 'succeeded'
         and (
           current_state.deal_toast_bytes_before is null
           or sizes.deal_toast_bytes >= current_state.deal_toast_bytes_before - 1000000
         ) then
        update public.storage_compaction_state
        set state = 'retry_wait',
            finished_at = coalesce(latest_run.end_time, statement_timestamp()),
            next_retry_at = statement_timestamp() + private.storage_compaction_backoff(attempt_count),
            database_bytes_after = sizes.database_bytes,
            deal_heap_bytes_after = sizes.deal_heap_bytes,
            deal_index_bytes_after = sizes.deal_index_bytes,
            deal_toast_bytes_after = sizes.deal_toast_bytes,
            last_error = 'TOAST-only compaction did not reclaim measurable space and may have skipped a busy relation.',
            skip_reason = 'toast-compaction-ineffective',
            updated_at = statement_timestamp()
        where id;
        return 'retry-wait';
      elsif latest_run.status = 'succeeded' then
        update public.storage_compaction_state
        set state = 'failed_closed',
            finished_at = coalesce(latest_run.end_time, statement_timestamp()),
            next_retry_at = null,
            database_bytes_after = sizes.database_bytes,
            deal_heap_bytes_after = sizes.deal_heap_bytes,
            deal_index_bytes_after = sizes.deal_index_bytes,
            deal_toast_bytes_after = sizes.deal_toast_bytes,
            last_error = 'TOAST-only compaction completed but database capacity remains above the automatic safety threshold.',
            skip_reason = 'automatic-main-rewrite-prohibited',
            updated_at = statement_timestamp()
        where id;
        return 'failed-closed';
      else
        update public.storage_compaction_state
        set state = 'retry_wait',
            finished_at = coalesce(latest_run.end_time, statement_timestamp()),
            next_retry_at = statement_timestamp() + private.storage_compaction_backoff(attempt_count),
            database_bytes_after = sizes.database_bytes,
            deal_heap_bytes_after = sizes.deal_heap_bytes,
            deal_index_bytes_after = sizes.deal_index_bytes,
            deal_toast_bytes_after = sizes.deal_toast_bytes,
            last_error = left(coalesce(latest_run.return_message, 'Compaction cron job failed.'), 1000),
            skip_reason = 'cron-failed',
            updated_at = statement_timestamp()
        where id;
        return 'retry-wait';
      end if;
    end if;

    if current_state.skip_reason in ('cron-stop-verification', 'controller-uncertain')
       and current_state.next_retry_at is not null
       and statement_timestamp() >= current_state.next_retry_at then
      select coalesce(job.active, false)
      into cron_job_active
      from cron.job job
      where job.jobid = current_state.cron_job_id;

      select exists (
        select 1
        from pg_catalog.pg_stat_activity activity
        where activity.datname = pg_catalog.current_database()
          and activity.pid <> pg_catalog.pg_backend_pid()
          and activity.query ~* 'vacuum[[:space:][:punct:]]+full'
          and activity.query ~* 'public[.]deals'
      ) into compaction_backend_active;

      if not coalesce(cron_job_active, false) and not compaction_backend_active then
        perform private.set_storage_compaction_lock_timeout(current_state.cron_job_id, false);
        update public.storage_compaction_state
        set state = 'retry_wait',
            next_retry_at = statement_timestamp() + private.storage_compaction_backoff(attempt_count),
            skip_reason = 'cron-stop-verified',
            updated_at = statement_timestamp()
        where id;
        return 'retry-wait';
      end if;

      update public.storage_compaction_state
      set state = 'running',
          next_retry_at = statement_timestamp() + interval '5 minutes',
          updated_at = statement_timestamp()
      where id;
      return 'running';
    end if;

    if current_state.state = 'scheduled'
       and statement_timestamp() > current_state.scheduled_at + interval '5 minutes' then
      perform cron.alter_job(current_state.cron_job_id, active := false);
      update public.storage_compaction_state
      set state = 'running',
          next_retry_at = statement_timestamp() + interval '5 minutes',
          last_error = 'Compaction cron job did not start within five minutes.',
          skip_reason = 'cron-stop-verification',
          updated_at = statement_timestamp()
      where id;
      return 'cron-stop-verification';
    end if;

    return current_state.state;
  end if;

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
    where id;
    return 'capacity-safe';
  end if;

  if current_state.state = 'failed_closed' then
    return 'failed-closed';
  end if;

  if current_state.state = 'succeeded' then
    update public.storage_compaction_state
    set state = 'idle',
        attempt_count = 0,
        requested_at = statement_timestamp(),
        finished_at = null,
        last_error = null,
        skip_reason = null,
        updated_at = statement_timestamp()
    where id
    returning * into current_state;
  end if;

  if current_state.state in ('cooldown', 'retry_wait')
     and current_state.next_retry_at is not null
     and statement_timestamp() < current_state.next_retry_at then
    return current_state.state;
  end if;

  if archive_pending or archive_state.zero_candidate_observations < 2 then
    update public.storage_compaction_state
    set state = 'cooldown',
        requested_at = coalesce(requested_at, statement_timestamp()),
        skip_reason = case when archive_pending then 'archive-backlog' else 'archive-verification' end,
        updated_at = statement_timestamp()
    where id;
    return 'archive-pending';
  end if;

  if archive_state.lease_expires_at is not null
     and archive_state.lease_expires_at >= statement_timestamp() then
    update public.storage_compaction_state
    set state = 'cooldown', skip_reason = 'archive-lease-active', updated_at = statement_timestamp()
    where id;
    return 'archive-lease-active';
  end if;

  if archive_state.last_archive_work_at is not null
     and archive_state.last_archive_work_at > statement_timestamp() - interval '10 minutes' then
    update public.storage_compaction_state
    set state = 'cooldown',
        next_retry_at = archive_state.last_archive_work_at + interval '10 minutes',
        skip_reason = 'archive-cooldown',
        updated_at = statement_timestamp()
    where id;
    return 'archive-cooldown';
  end if;

  select exists (
    select 1
    from pg_catalog.pg_stat_activity activity
    where activity.datname = pg_catalog.current_database()
      and activity.pid <> pg_catalog.pg_backend_pid()
      and activity.state = 'active'
      and activity.query_start < statement_timestamp() - interval '5 seconds'
      and activity.query not ilike '%reconcile_storage_compaction%'
  ) into active_query;

  select exists (
    select 1
    from pg_catalog.pg_stat_activity activity
    where activity.datname = pg_catalog.current_database()
      and activity.pid <> pg_catalog.pg_backend_pid()
      and activity.xact_start is not null
      and activity.xact_start < statement_timestamp() - interval '30 seconds'
  ) into long_transaction;

  select nullif(relation.reltoastrelid, 0::oid)
  into deal_toast_oid
  from pg_catalog.pg_class relation
  where relation.oid = 'public.deals'::regclass;

  select exists (
    select 1
    from pg_catalog.pg_stat_progress_vacuum vacuum_progress
    where vacuum_progress.relid in ('public.deals'::regclass, deal_toast_oid)
    union all
    select 1
    from pg_catalog.pg_stat_progress_cluster cluster_progress
    where cluster_progress.relid in ('public.deals'::regclass, deal_toast_oid)
  ) into maintenance_active;

  if active_query or long_transaction or maintenance_active then
    update public.storage_compaction_state
    set state = 'cooldown',
        next_retry_at = statement_timestamp() + interval '15 minutes',
        skip_reason = case
          when long_transaction then 'long-transaction'
          when active_query then 'active-query'
          else 'relation-maintenance-active'
        end,
        updated_at = statement_timestamp()
    where id;
    return 'database-busy';
  end if;

  singapore_hour := extract(hour from statement_timestamp() at time zone 'Asia/Singapore')::integer;
  if sizes.database_bytes < 475000000 and (singapore_hour < 2 or singapore_hour >= 6) then
    update public.storage_compaction_state
    set state = 'cooldown',
        next_retry_at = null,
        skip_reason = 'maintenance-window',
        updated_at = statement_timestamp()
    where id;
    return 'maintenance-window';
  end if;

  if current_state.cron_job_id is null then
    update public.storage_compaction_state
    set state = 'failed_closed',
        last_error = 'The storage-toast-compaction cron job is unavailable.',
        skip_reason = 'cron-job-missing',
        updated_at = statement_timestamp()
    where id;
    return 'failed-closed';
  end if;

  next_minute := pg_catalog.date_trunc('minute', statement_timestamp()) + interval '1 minute';
  schedule_expression := pg_catalog.format(
    '%s %s %s %s *',
    extract(minute from next_minute)::integer,
    extract(hour from next_minute)::integer,
    extract(day from next_minute)::integer,
    extract(month from next_minute)::integer
  );

  was_compaction_active := true;
  perform private.set_storage_compaction_lock_timeout(current_state.cron_job_id, true);
  perform cron.alter_job(
    current_state.cron_job_id,
    schedule := schedule_expression,
    active := true
  );

  update public.storage_compaction_state
  set state = 'scheduled',
      requested_at = coalesce(requested_at, statement_timestamp()),
      scheduled_at = next_minute,
      started_at = null,
      finished_at = null,
      next_retry_at = null,
      attempt_count = attempt_count + 1,
      database_bytes_before = sizes.database_bytes,
      deal_heap_bytes_before = sizes.deal_heap_bytes,
      deal_index_bytes_before = sizes.deal_index_bytes,
      deal_toast_bytes_before = sizes.deal_toast_bytes,
      database_bytes_after = null,
      deal_heap_bytes_after = null,
      deal_index_bytes_after = null,
      deal_toast_bytes_after = null,
      last_error = null,
      skip_reason = null,
      updated_at = statement_timestamp()
  where id;

  return 'scheduled';
exception
  when others then
    controller_error := sqlerrm;
    if was_compaction_active then
      begin
        if current_state.cron_job_id is not null then
          perform cron.alter_job(current_state.cron_job_id, active := false);
        end if;
      exception when others then
        null;
      end;

      update public.storage_compaction_state
      set state = 'running',
          next_retry_at = statement_timestamp() + interval '5 minutes',
          last_error = left(controller_error, 1000),
          skip_reason = 'controller-uncertain',
          updated_at = statement_timestamp()
      where id;
      return 'controller-uncertain';
    end if;

    update public.storage_compaction_state
    set state = 'retry_wait',
        next_retry_at = statement_timestamp() + interval '60 minutes',
        last_error = left(controller_error, 1000),
        skip_reason = 'controller-error',
        updated_at = statement_timestamp()
    where id;
    return 'controller-error';
end;
$$;

revoke all on function private.reconcile_storage_compaction() from public, anon, authenticated;

create or replace function public.storage_compaction_status()
returns table (
  state text,
  requested_at timestamptz,
  scheduled_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  next_retry_at timestamptz,
  attempt_count integer,
  database_bytes_before bigint,
  database_bytes_after bigint,
  deal_toast_bytes_before bigint,
  deal_toast_bytes_after bigint,
  last_error text,
  skip_reason text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    recovery.state,
    recovery.requested_at,
    recovery.scheduled_at,
    recovery.started_at,
    recovery.finished_at,
    recovery.next_retry_at,
    recovery.attempt_count,
    recovery.database_bytes_before,
    recovery.database_bytes_after,
    recovery.deal_toast_bytes_before,
    recovery.deal_toast_bytes_after,
    case
      when recovery.last_error is null then null
      when recovery.skip_reason = 'automatic-main-rewrite-prohibited' then
        'Automatic TOAST compaction completed, but database capacity is still above the safe limit.'
      when recovery.skip_reason in ('cron-stop-verification', 'controller-uncertain') then
        'Automatic compaction completion is being verified. HubSpot import remains paused.'
      when recovery.skip_reason = 'toast-compaction-ineffective' then
        'Automatic compaction did not reclaim enough space and will retry safely.'
      else 'Automatic storage recovery encountered an internal error.'
    end,
    recovery.skip_reason
  from public.storage_compaction_state recovery
  where recovery.id;
$$;

revoke all on function public.storage_compaction_status()
  from public, anon, authenticated;
grant execute on function public.storage_compaction_status()
  to service_role;

drop function if exists public.storage_import_admission(uuid);

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
  global_pending boolean;
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
  select exists (
    select 1 from public.storage_archive_owner_candidates()
  ) into global_pending;

  if archive_state.id is null or recovery_state.id is null or import_state.id is null then
    return query select 'status_unavailable', used_bytes, 500000000::bigint, global_pending,
      coalesce(recovery_state.state, 'idle'), 'recovery-state-unavailable', null::uuid;
  elsif not recovery_state.controller_enabled then
    return query select 'status_unavailable', used_bytes, 500000000::bigint, global_pending,
      recovery_state.state, 'controller-disabled', null::uuid;
  elsif recovery_state.state in ('cooldown', 'scheduled', 'running', 'retry_wait') then
    return query select 'compacting', used_bytes, 500000000::bigint, global_pending,
      recovery_state.state, recovery_state.state, null::uuid;
  elsif recovery_state.state = 'failed_closed' then
    return query select 'capacity_guard', used_bytes, 500000000::bigint, global_pending,
      recovery_state.state, 'failed-closed', null::uuid;
  elsif archive_state.lease_expires_at is not null
     and archive_state.lease_expires_at >= statement_timestamp() then
    return query select 'archiving', used_bytes, 500000000::bigint, global_pending,
      recovery_state.state, 'archive-active', null::uuid;
  elsif global_pending then
    return query select 'archiving', used_bytes, 500000000::bigint, true,
      recovery_state.state, 'archive-pending', null::uuid;
  elsif import_state.lease_expires_at is not null
     and import_state.lease_expires_at >= statement_timestamp() then
    return query select 'status_unavailable', used_bytes, 500000000::bigint, global_pending,
      recovery_state.state, 'import-lease-active', null::uuid;
  elsif used_bytes >= 410000000 then
    return query select 'capacity_guard', used_bytes, 500000000::bigint, global_pending,
      recovery_state.state, 'capacity', null::uuid;
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

create or replace function public.release_storage_import_lease(p_token uuid)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.storage_import_state
  set owner_id = null,
      lease_token = null,
      lease_expires_at = null
  where id and lease_token = p_token;
  return found;
end;
$$;

revoke all on function public.release_storage_import_lease(uuid)
  from public, anon, authenticated;
grant execute on function public.release_storage_import_lease(uuid)
  to service_role;

create or replace function public.claim_storage_archive_lease(p_lease_seconds integer default 600)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  claimed_token uuid := gen_random_uuid();
  archive_state public.storage_archive_state%rowtype;
  recovery_state public.storage_compaction_state%rowtype;
  import_state public.storage_import_state%rowtype;
begin
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

  if recovery_state.state in ('scheduled', 'running')
     or (
       import_state.lease_expires_at is not null
       and import_state.lease_expires_at >= statement_timestamp()
     ) then
    return null;
  end if;

  update public.storage_archive_state
  set lease_token = claimed_token,
      lease_expires_at = statement_timestamp()
        + make_interval(secs => greatest(30, least(p_lease_seconds, 600)))
  where id
    and (lease_expires_at is null or lease_expires_at < statement_timestamp());

  if not found then return null; end if;
  return claimed_token;
end;
$$;

revoke all on function public.claim_storage_archive_lease(integer)
  from public, anon, authenticated;
grant execute on function public.claim_storage_archive_lease(integer)
  to service_role;

do $$
declare
  compaction_job_id bigint;
  worker_url text;
  cron_secret text;
begin
  create extension if not exists pg_net with schema extensions;
  create extension if not exists pg_cron;

  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'storage-toast-compaction';

  select cron.schedule(
    'storage-toast-compaction',
    '0 0 1 1 *',
    $compaction$
      VACUUM (
        FULL,
        PROCESS_MAIN FALSE,
        PROCESS_TOAST TRUE
      ) public.deals;
    $compaction$
  ) into compaction_job_id;
  perform cron.alter_job(compaction_job_id, active := false);

  update public.storage_compaction_state
  set cron_job_id = compaction_job_id,
      updated_at = statement_timestamp()
  where id;

  select
    regexp_replace(worker.decrypted_secret, '/process-email-queue/?$', '/storage-maintenance'),
    secret.decrypted_secret
  into worker_url, cron_secret
  from vault.decrypted_secrets worker
  cross join vault.decrypted_secrets secret
  where worker.name = 'queue_worker_url'
    and secret.name = 'queue_cron_secret'
  limit 1;

  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'storage-pressure-r2-archive';

  if worker_url is null or cron_secret is null then
    raise notice 'Storage recovery cron not installed: queue_worker_url or queue_cron_secret is absent from Vault.';
  elsif worker_url !~ '/storage-maintenance$' or length(cron_secret) < 16 then
    raise notice 'Storage recovery cron not installed: Vault configuration is invalid.';
  else
    perform cron.schedule('storage-pressure-r2-archive', '* * * * *', $job$
      with config as (
        select
          regexp_replace(worker.decrypted_secret, '/process-email-queue/?$', '/storage-maintenance') as worker_url,
          secret.decrypted_secret as cron_secret
        from vault.decrypted_secrets worker
        cross join vault.decrypted_secrets secret
        where worker.name = 'queue_worker_url'
          and secret.name = 'queue_cron_secret'
        limit 1
      )
      select net.http_post(
        url := config.worker_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'X-Storage-Cron-Secret', config.cron_secret
        ),
        body := '{}'::jsonb
      )
      from config
      where config.worker_url is not null and config.cron_secret is not null;

      select private.reconcile_storage_compaction();
    $job$);
  end if;
end $$;

comment on table public.storage_compaction_state is
  'Service-only singleton for automatic, TOAST-first database compaction.';
comment on function public.claim_storage_import_admission(uuid, integer) is
  'Service-role-only atomic, fail-closed HubSpot import admission under storage pressure.';
comment on function public.release_storage_import_lease(uuid) is
  'Releases the matching short-lived HubSpot import lease.';
