-- Keep complete deal snapshots in verified, owner-scoped R2 objects. Postgres
-- retains searchable relational fields and the pointer needed for read-through.

create or replace function public.finalize_hubspot_deal_property_archive_batch(
  p_owner_id uuid,
  p_schema_version text,
  p_r2_key text,
  p_r2_sha256 text,
  p_rows jsonb
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  finalized integer;
begin
  if p_schema_version is null or btrim(p_schema_version) = '' then
    raise exception 'deal property schema version is required';
  end if;
  if p_r2_key is null or p_r2_key not like 'owners/' || p_owner_id::text || '/deal-batches/%' then
    raise exception 'deal archive key is outside the owner scope';
  end if;
  if p_r2_sha256 is null or p_r2_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'deal archive checksum is invalid';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'deal archive rows must be a non-empty array';
  end if;

  with incoming as (
    select row.id, row.hubspot_deal_id, row.expected_modified_at
    from jsonb_to_recordset(p_rows) as row(
      id uuid,
      hubspot_deal_id text,
      expected_modified_at timestamptz
    )
  ), updated as (
    update public.deals deal
    set hubspot_properties = '{}'::jsonb,
        hubspot_properties_schema_version = p_schema_version,
        r2_archive_key = p_r2_key,
        r2_archive_sha256 = p_r2_sha256,
        r2_archived_at = now()
    from incoming
    where deal.owner_id = p_owner_id
      and deal.id = incoming.id
      and deal.hubspot_deal_id = incoming.hubspot_deal_id
      and deal.hubspot_modified_at is not distinct from incoming.expected_modified_at
    returning deal.id
  )
  select count(*) into finalized from updated;

  return finalized;
end;
$$;

revoke all on function public.finalize_hubspot_deal_property_archive_batch(uuid, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.finalize_hubspot_deal_property_archive_batch(uuid, text, text, text, jsonb)
  to service_role;

comment on function public.finalize_hubspot_deal_property_archive_batch(uuid, text, text, text, jsonb) is
  'Finalizes an already verified owner-scoped R2 repair batch without storing raw snapshots in Postgres.';

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
  select
    count(*) as total_deals,
    count(*) filter (
      where coalesce(deal.hubspot_properties, '{}'::jsonb) <> '{}'::jsonb
    ) as pending_snapshots,
    count(*) filter (
      where coalesce(deal.hubspot_properties, '{}'::jsonb) = '{}'::jsonb
        and deal.r2_archive_key is not null
        and deal.r2_archive_sha256 is not null
        and deal.r2_archived_at is not null
    ) as archived_snapshots
  from public.deals deal
  where deal.owner_id = p_owner_id;
$$;

revoke all on function public.deal_archive_storage_status(uuid)
  from public, anon, authenticated;
grant execute on function public.deal_archive_storage_status(uuid)
  to service_role;

-- cron.job_run_details is execution telemetry. It is intentionally cleared now
-- to return its relation files to the database immediately, then retained for
-- only seven days so it cannot consume CRM capacity again.
truncate table cron.job_run_details;

do $$
declare
  worker_url text;
  cron_secret text;
begin
  create extension if not exists pg_net with schema extensions;
  create extension if not exists pg_cron;

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
    raise notice 'Storage archive cron not installed: queue_worker_url or queue_cron_secret is absent from Vault.';
  elsif worker_url !~ '/storage-maintenance$' or length(cron_secret) < 16 then
    raise notice 'Storage archive cron not installed: Vault configuration is invalid.';
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
    $job$);
  end if;

  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'prune-cron-job-history';

  perform cron.schedule('prune-cron-job-history', '17 3 * * *', $job$
    delete from cron.job_run_details
    where end_time < now() - interval '7 days';
  $job$);
end $$;
