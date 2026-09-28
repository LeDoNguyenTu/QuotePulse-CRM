alter table public.crm_activities
  add column source_import_id uuid,
  add column source_row_number integer check (source_row_number is null or source_row_number > 0),
  add column source_column text check (source_column is null or length(btrim(source_column)) between 1 and 100),
  add foreign key (workspace_id, source_import_id)
    references public.crm_source_imports (workspace_id, id) on delete set null (source_import_id);

create unique index crm_activities_source_row_column_uidx
  on public.crm_activities (workspace_id, source_import_id, source_row_number, source_column)
  where source_import_id is not null;

create or replace function public.crm_commit_import_with_activities(
  p_workspace_id uuid,
  p_original_filename text,
  p_sheet_name text,
  p_checksum_sha256 text,
  p_source_row_count integer,
  p_rows jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
  v_source_import_id uuid;
  v_row jsonb;
  v_activity jsonb;
  v_row_number integer;
  v_company_id uuid;
  v_contact_id uuid;
  v_deal_id uuid;
  v_created integer := 0;
  v_inserted integer;
begin
  if v_user_id is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = p_workspace_id and wm.user_id = v_user_id
  ) then raise exception 'workspace membership required' using errcode = '42501'; end if;

  v_result := public.crm_commit_import(
    p_workspace_id, p_original_filename, p_sheet_name, p_checksum_sha256,
    p_source_row_count, p_rows
  );
  v_source_import_id := (v_result->>'source_import_id')::uuid;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_row_number := nullif(v_row->>'rowNumber', '')::integer;
    if v_row->'activities' is null then continue; end if;
    if jsonb_typeof(v_row->'activities') <> 'array' or jsonb_array_length(v_row->'activities') > 10 then
      raise exception 'invalid activities for source row %', v_row_number using errcode = '22023';
    end if;

    select max(company_id::text)::uuid, max(contact_id::text)::uuid, max(deal_id::text)::uuid
      into v_company_id, v_contact_id, v_deal_id
    from public.crm_source_references
    where workspace_id = p_workspace_id
      and source_import_id = v_source_import_id
      and source_row_number = v_row_number;

    if num_nonnulls(v_company_id, v_contact_id, v_deal_id) = 0 then
      raise exception 'activity target missing for source row %', v_row_number;
    end if;

    for v_activity in select value from jsonb_array_elements(v_row->'activities')
    loop
      if v_activity->>'kind' not in ('note', 'call') then
        raise exception 'invalid activity kind for source row %', v_row_number using errcode = '22023';
      end if;
      if nullif(btrim(v_activity->>'source_column'), '') is null then
        raise exception 'activity source column is required for source row %', v_row_number using errcode = '22023';
      end if;
      insert into public.crm_activities (
        workspace_id, company_id, contact_id, deal_id, kind, body, occurred_at,
        source_import_id, source_row_number, source_column, created_by
      ) values (
        p_workspace_id, v_company_id, v_contact_id, v_deal_id,
        v_activity->>'kind', btrim(v_activity->>'body'),
        coalesce(nullif(v_activity->>'occurred_at', '')::timestamptz, now()),
        v_source_import_id, v_row_number, nullif(btrim(v_activity->>'source_column'), ''), v_user_id
      ) on conflict (workspace_id, source_import_id, source_row_number, source_column)
        where source_import_id is not null do nothing;
      get diagnostics v_inserted = row_count;
      v_created := v_created + v_inserted;
    end loop;
  end loop;

  return v_result || jsonb_build_object('created_activities', v_created);
end;
$$;

revoke all on function public.crm_commit_import_with_activities(uuid, text, text, text, integer, jsonb) from public, anon;
grant execute on function public.crm_commit_import_with_activities(uuid, text, text, text, integer, jsonb) to authenticated;

create or replace function public.crm_add_activity(
  p_workspace_id uuid,
  p_target_kind text,
  p_target_id uuid,
  p_kind text,
  p_body text,
  p_occurred_at timestamptz,
  p_update_last_call boolean default false
)
returns public.crm_activities
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_activity public.crm_activities%rowtype;
begin
  if v_user_id is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = p_workspace_id and wm.user_id = v_user_id
  ) then raise exception 'workspace membership required' using errcode = '42501'; end if;
  if p_target_kind not in ('company', 'contact', 'deal') then raise exception 'invalid activity target' using errcode = '22023'; end if;
  if p_kind not in ('note', 'call') then raise exception 'invalid activity kind' using errcode = '22023'; end if;
  if length(btrim(coalesce(p_body, ''))) not between 1 and 20000 then raise exception 'invalid activity body' using errcode = '22023'; end if;

  if p_target_kind = 'company' and not exists (select 1 from public.crm_companies where workspace_id = p_workspace_id and id = p_target_id) then raise exception 'activity target unavailable' using errcode = 'P0002'; end if;
  if p_target_kind = 'contact' and not exists (select 1 from public.crm_contacts where workspace_id = p_workspace_id and id = p_target_id) then raise exception 'activity target unavailable' using errcode = 'P0002'; end if;
  if p_target_kind = 'deal' and not exists (select 1 from public.crm_deals where workspace_id = p_workspace_id and id = p_target_id) then raise exception 'activity target unavailable' using errcode = 'P0002'; end if;

  insert into public.crm_activities (workspace_id, company_id, contact_id, deal_id, kind, body, occurred_at, created_by)
  values (
    p_workspace_id,
    case when p_target_kind = 'company' then p_target_id end,
    case when p_target_kind = 'contact' then p_target_id end,
    case when p_target_kind = 'deal' then p_target_id end,
    p_kind, btrim(p_body), coalesce(p_occurred_at, now()), v_user_id
  ) returning * into v_activity;

  if p_update_last_call and p_kind = 'call' and p_target_kind = 'deal' then
    update public.crm_deals
    set last_call_at = v_activity.occurred_at, updated_by = v_user_id
    where workspace_id = p_workspace_id and id = p_target_id;
  end if;

  return v_activity;
end;
$$;

revoke all on function public.crm_add_activity(uuid, text, uuid, text, text, timestamptz, boolean) from public, anon;
grant execute on function public.crm_add_activity(uuid, text, uuid, text, text, timestamptz, boolean) to authenticated;
