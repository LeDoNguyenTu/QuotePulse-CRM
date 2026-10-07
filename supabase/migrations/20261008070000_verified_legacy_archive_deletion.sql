alter table public.workspace_archives
  drop constraint if exists workspace_archives_status_check;
alter table public.workspace_archives
  add constraint workspace_archives_status_check
  check (status in ('building', 'verified', 'failed', 'deletion_eligible', 'deleting', 'deleted'));

alter table public.workspace_archive_tables
  add column if not exists deletion_status text not null default 'pending'
    check (deletion_status in ('pending', 'deleting', 'deleted', 'failed')),
  add column if not exists deletion_row_count bigint not null default 0
    check (deletion_row_count >= 0),
  add column if not exists deletion_retained_count bigint not null default 0
    check (deletion_retained_count >= 0),
  add column if not exists deletion_started_at timestamptz,
  add column if not exists deletion_completed_at timestamptz;

create index if not exists workspace_archive_tables_deletion_progress_idx
  on public.workspace_archive_tables (archive_id, deletion_status, restore_order desc);

create or replace function private.bump_legacy_data_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  if current_setting('quotepulse.legacy_archive_delete', true) = 'on' then
    return null;
  end if;
  v_owner := coalesce(
    nullif(to_jsonb(new) ->> tg_argv[0], ''),
    nullif(to_jsonb(old) ->> tg_argv[0], '')
  )::uuid;
  if v_owner is not null then
    insert into public.legacy_data_versions(owner_id, version)
    values (v_owner, 1)
    on conflict(owner_id) do update
      set version = public.legacy_data_versions.version + 1,
          updated_at = now();
  end if;
  return null;
end;
$$;
revoke all on function private.bump_legacy_data_version() from public, anon, authenticated;

create or replace function public.delete_legacy_workspace_archive_batch(
  p_archive_id uuid,
  p_owner_id uuid,
  p_batch_size integer default 5000
)
returns table (
  status text,
  table_name text,
  deleted_rows bigint,
  total_deleted_rows bigint,
  retained_rows bigint,
  total_retained_rows bigint,
  complete boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_version bigint;
  v_current_version bigint;
  v_counts jsonb;
  v_expected_total bigint;
  v_table text;
  v_owner_column text;
  v_cursor_column text;
  v_protection_sql text := '';
  v_batch integer := greatest(1, least(coalesce(p_batch_size, 5000), 5000));
  v_deleted bigint := 0;
  v_total bigint := 0;
  v_retained bigint := 0;
  v_total_retained bigint := 0;
begin
  select archive.source_version, archive.table_counts
    into v_source_version, v_counts
  from public.workspace_archives archive
  where archive.id = p_archive_id
    and archive.created_by = p_owner_id
    and archive.status in ('deletion_eligible', 'deleting')
  for update;
  if not found then
    raise exception 'deletion-eligible workspace archive not found' using errcode = '22023';
  end if;

  select version into v_current_version
  from public.legacy_data_versions
  where owner_id = p_owner_id
  for update;
  if v_current_version is distinct from v_source_version then
    raise exception 'legacy data changed after archive capture' using errcode = '40001';
  end if;
  if exists (
    select 1 from public.workspace_archive_objects object
    where object.archive_id = p_archive_id
      and (object.status <> 'verified' or object.deletion_verified_at is null)
  ) then
    raise exception 'archive object verification is incomplete' using errcode = '22023';
  end if;

  select progress.table_name
    into v_table
  from public.workspace_archive_tables progress
  where progress.archive_id = p_archive_id
    and progress.deletion_status <> 'deleted'
  order by progress.restore_order desc
  limit 1
  for update;

  if v_table is null then
    select coalesce(sum(progress.deletion_row_count), 0),
           coalesce(sum(progress.deletion_retained_count), 0)
      into v_total, v_total_retained
    from public.workspace_archive_tables progress
    where progress.archive_id = p_archive_id;
    select coalesce(sum(entry.value::bigint), 0)
      into v_expected_total
    from jsonb_each_text(v_counts) entry;
    if v_total + v_total_retained <> v_expected_total then
      raise exception 'deleted row counts do not reconcile with the verified archive' using errcode = '22023';
    end if;
    update public.workspace_archives
      set status = 'deleted', deleted_at = coalesce(deleted_at, now()), last_error = null
      where id = p_archive_id;
    return query select 'deleted'::text, null::text, 0::bigint, v_total, 0::bigint, v_total_retained, true;
    return;
  end if;

  select spec.owner_column, spec.cursor_column
    into v_owner_column, v_cursor_column
  from (values
    ('companies', 'owner_id', 'id'),
    ('email_templates', 'owner_id', 'id'),
    ('deals', 'owner_id', 'id'),
    ('contacts', 'owner_id', 'id'),
    ('kyc_profiles', 'owner_id', 'id'),
    ('attachments', 'owner_id', 'id'),
    ('email_sends', 'created_by', 'id'),
    ('uploaded_files', 'owner_id', 'id'),
    ('uploaded_file_rows', 'owner_id', 'id'),
    ('uploaded_file_merges', 'owner_id', 'id'),
    ('job_source_configs', 'owner_id', 'id'),
    ('job_opportunities', 'owner_id', 'id'),
    ('email_suppressions', 'owner_id', 'email_normalized'),
    ('company_attachment_archives', 'owner_id', 'id')
  ) as spec(table_name, owner_column, cursor_column)
  where spec.table_name = v_table;
  if v_owner_column is null then
    raise exception 'archive table is not deletion allow-listed' using errcode = '22023';
  end if;

  if v_table = 'email_sends' then
    v_protection_sql := 'and not exists (select 1 from public.email_unsubscribe_tokens protected where protected.email_send_id = candidate.id) and not exists (select 1 from public.crm_campaign_recipients protected where protected.email_send_id = candidate.id)';
  elsif v_table = 'email_templates' then
    v_protection_sql := 'and not exists (select 1 from public.crm_email_campaigns protected where protected.template_id = candidate.id) and not exists (select 1 from public.email_sends protected where protected.template_id = candidate.id)';
  elsif v_table = 'contacts' then
    v_protection_sql := 'and not exists (select 1 from public.email_sends protected where protected.contact_id = candidate.id)';
  elsif v_table = 'companies' then
    v_protection_sql := 'and not exists (select 1 from public.email_sends protected where protected.company_id = candidate.id) and not exists (select 1 from public.contacts protected where protected.company_id = candidate.id)';
  end if;

  update public.workspace_archive_tables
    set deletion_status = 'deleting',
        deletion_started_at = coalesce(deletion_started_at, now())
    where archive_id = p_archive_id and table_name = v_table;

  perform set_config('quotepulse.legacy_archive_delete', 'on', true);
  perform set_config('statement_timeout', '30s', true);
  execute format(
    'with victims as (
       select candidate.ctid from public.%I candidate
       where candidate.%I = $1 %s
       order by candidate.%I
       limit $2
       for update skip locked
     )
     delete from public.%I target
     using victims
     where target.ctid = victims.ctid',
    v_table, v_owner_column, v_protection_sql, v_cursor_column, v_table
  ) using p_owner_id, v_batch;
  get diagnostics v_deleted = row_count;

  if v_deleted < v_batch then
    execute format(
      'select count(*) from public.%I candidate where candidate.%I = $1',
      v_table, v_owner_column
    ) into v_retained using p_owner_id;
  end if;

  update public.workspace_archive_tables
    set deletion_row_count = deletion_row_count + v_deleted,
        deletion_retained_count = case when v_deleted < v_batch then v_retained else deletion_retained_count end,
        deletion_status = case when v_deleted < v_batch then 'deleted' else 'deleting' end,
        deletion_completed_at = case when v_deleted < v_batch then now() else null end
    where archive_id = p_archive_id and table_name = v_table;
  update public.workspace_archives
    set status = 'deleting', last_error = null
    where id = p_archive_id;
  select coalesce(sum(progress.deletion_row_count), 0),
         coalesce(sum(progress.deletion_retained_count), 0)
    into v_total, v_total_retained
  from public.workspace_archive_tables progress
  where progress.archive_id = p_archive_id;

  return query select 'deleting'::text, v_table, v_deleted, v_total, v_retained, v_total_retained, false;
end;
$$;

revoke all on function public.delete_legacy_workspace_archive_batch(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.delete_legacy_workspace_archive_batch(uuid, uuid, integer)
  to service_role;

comment on function public.delete_legacy_workspace_archive_batch(uuid, uuid, integer) is
  'Deletes one bounded, reverse-dependency batch after archive verification while retaining rows referenced by excluded security or Sales CRM records.';
