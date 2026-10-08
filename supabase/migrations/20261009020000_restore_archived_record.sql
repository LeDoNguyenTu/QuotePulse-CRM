create table if not exists public.workspace_archive_record_restores (
  id uuid primary key default gen_random_uuid(),
  archive_id uuid not null references public.workspace_archives(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  table_name text not null check (table_name in ('companies','deals','contacts')),
  record_id uuid not null,
  status text not null check (status in ('restored','already_restored','conflict')),
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.workspace_archive_record_restores enable row level security;
create index if not exists workspace_archive_record_restores_archive_idx on public.workspace_archive_record_restores(archive_id,created_at desc);

create or replace function public.restore_archived_legacy_records(
  p_workspace_id uuid,
  p_archive_id uuid,
  p_owner_id uuid,
  p_records jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  row_data jsonb;
  table_name text;
  record_id uuid;
  existing jsonb;
  columns_sql text;
  key_name text;
  result_items jsonb := '[]'::jsonb;
  item_status text;
begin
  if p_owner_id is null or jsonb_typeof(p_records) <> 'array' or jsonb_array_length(p_records) not between 1 and 2 then
    raise exception 'Invalid archived restore request.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.workspace_archives a where a.id=p_archive_id and a.workspace_id=p_workspace_id and a.created_by=p_owner_id and a.status in ('verified','deletion_eligible','deleted')) then
    raise exception 'Verified owner-scoped archive required.' using errcode = '42501';
  end if;

  begin
  for item in select value from jsonb_array_elements(p_records) loop
    table_name := item->>'table';
    row_data := item->'row';
    if table_name not in ('companies', 'deals', 'contacts') or jsonb_typeof(row_data) <> 'object' then
      raise exception 'Archived restore table is not allow-listed.' using errcode = '22023';
    end if;
    if row_data->>'owner_id' is distinct from p_owner_id::text then
      raise exception 'Archived restore owner mismatch.' using errcode = '42501';
    end if;
    record_id := (row_data->>'id')::uuid;

    execute format('select to_jsonb(t) from public.%I t where id = $1', table_name) into existing using record_id;
    if existing is not null then
      if existing->>'owner_id' is distinct from p_owner_id::text then
        raise exception 'Archived record primary key belongs to another owner.' using errcode = '42501';
      end if;
      for key_name in select jsonb_object_keys(row_data) loop
        if key_name <> 'search_tsv' and existing->key_name is distinct from row_data->key_name then
          raise exception 'archive_restore_conflict' using errcode = 'P0002';
        end if;
      end loop;
      item_status := 'already_restored';
    else
      select string_agg(quote_ident(a.attname), ',' order by a.attnum)
        into columns_sql
        from pg_catalog.pg_attribute a
       where a.attrelid = format('public.%I', table_name)::regclass
         and a.attnum > 0 and not a.attisdropped and a.attgenerated = '';
      execute format(
        'insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1) on conflict do nothing',
        table_name, columns_sql, columns_sql, table_name
      ) using row_data;
      execute format('select to_jsonb(t) from public.%I t where id = $1', table_name) into existing using record_id;
      if existing is null then
        raise exception 'archive_restore_conflict' using errcode = 'P0002';
      end if;
      item_status := 'restored';
    end if;
    result_items := result_items || jsonb_build_array(jsonb_build_object('table',table_name,'record_id',record_id,'status',item_status));
  end loop;
  exception when sqlstate 'P0002' then
    insert into public.workspace_archive_record_restores(archive_id,workspace_id,owner_id,table_name,record_id,status,result)
    values(p_archive_id,p_workspace_id,p_owner_id,coalesce(table_name,'companies'),coalesce(record_id,extensions.gen_random_uuid()),'conflict',jsonb_build_object('results','[]'::jsonb));
    return jsonb_build_object('status','conflict','results','[]'::jsonb);
  end;
  insert into public.workspace_archive_record_restores(archive_id,workspace_id,owner_id,table_name,record_id,status,result)
  values(p_archive_id,p_workspace_id,p_owner_id,(p_records->-1)->>'table',((p_records->-1)->'row'->>'id')::uuid,case when result_items @> '[{"status":"restored"}]'::jsonb then 'restored' else 'already_restored' end,jsonb_build_object('results',result_items));
  return jsonb_build_object('status', case when result_items @> '[{"status":"restored"}]'::jsonb then 'restored' else 'already_restored' end, 'results', result_items);
end;
$$;

revoke all on function public.restore_archived_legacy_records(uuid,uuid,uuid,jsonb) from public;
revoke all on function public.restore_archived_legacy_records(uuid,uuid,uuid,jsonb) from anon;
revoke all on function public.restore_archived_legacy_records(uuid,uuid,uuid,jsonb) from authenticated;
grant execute on function public.restore_archived_legacy_records(uuid,uuid,uuid,jsonb) to service_role;
