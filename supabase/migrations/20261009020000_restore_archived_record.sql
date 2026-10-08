create or replace function public.restore_archived_legacy_records(
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
          return jsonb_build_object('status','conflict','table',table_name,'record_id',record_id,'results',result_items);
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
        return jsonb_build_object('status','conflict','table',table_name,'record_id',record_id,'results',result_items);
      end if;
      item_status := 'restored';
    end if;
    result_items := result_items || jsonb_build_array(jsonb_build_object('table',table_name,'record_id',record_id,'status',item_status));
  end loop;
  return jsonb_build_object('status', case when result_items @> '[{"status":"restored"}]'::jsonb then 'restored' else 'already_restored' end, 'results', result_items);
end;
$$;

revoke all on function public.restore_archived_legacy_records(uuid,jsonb) from public;
revoke all on function public.restore_archived_legacy_records(uuid,jsonb) from anon;
revoke all on function public.restore_archived_legacy_records(uuid,jsonb) from authenticated;
grant execute on function public.restore_archived_legacy_records(uuid,jsonb) to service_role;
