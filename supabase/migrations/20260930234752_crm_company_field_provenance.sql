create or replace function public.crm_company_field_sources_valid(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(value) = 'object'
    and not exists (
      select 1 from jsonb_each_text(value) entry
      where entry.key not in (
        'name', 'industry', 'website', 'domain', 'phone', 'address_line_1',
        'address_line_2', 'city', 'state_region', 'postal_code', 'country'
      ) or entry.value not in ('user', 'workbook', 'classifier', 'enrichment', 'legacy')
    );
$$;

alter table public.crm_companies
  add column field_sources jsonb not null default '{}'::jsonb,
  add constraint crm_companies_field_sources_valid
    check (public.crm_company_field_sources_valid(field_sources));

update public.crm_companies company
set field_sources = jsonb_strip_nulls(jsonb_build_object(
  'name', case when nullif(btrim(company.name), '') is not null then 'legacy' end,
  'industry', case when nullif(btrim(company.industry), '') is not null then 'legacy' end,
  'website', case when nullif(btrim(company.website), '') is not null then 'legacy' end,
  'domain', case when nullif(btrim(company.domain), '') is not null then 'legacy' end,
  'phone', case when nullif(btrim(company.phone), '') is not null then 'legacy' end,
  'address_line_1', case when nullif(btrim(company.address_line_1), '') is not null then 'legacy' end,
  'address_line_2', case when nullif(btrim(company.address_line_2), '') is not null then 'legacy' end,
  'city', case when nullif(btrim(company.city), '') is not null then 'legacy' end,
  'state_region', case when nullif(btrim(company.state_region), '') is not null then 'legacy' end,
  'postal_code', case when nullif(btrim(company.postal_code), '') is not null then 'legacy' end,
  'country', case when nullif(btrim(company.country), '') is not null then 'legacy' end
));

create or replace function public.crm_track_company_user_sources()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  field_name text;
begin
  foreach field_name in array array[
    'name', 'industry', 'website', 'domain', 'phone', 'address_line_1',
    'address_line_2', 'city', 'state_region', 'postal_code', 'country'
  ] loop
    if to_jsonb(new)->field_name is distinct from to_jsonb(old)->field_name
       and new.field_sources->field_name is not distinct from old.field_sources->field_name then
      if nullif(btrim(to_jsonb(new)->>field_name), '') is null then
        new.field_sources := new.field_sources - field_name;
      else
        new.field_sources := jsonb_set(new.field_sources, array[field_name], '"user"'::jsonb, true);
      end if;
    end if;
  end loop;
  return new;
end;
$$;

create trigger crm_companies_track_user_sources
before update on public.crm_companies
for each row execute function public.crm_track_company_user_sources();

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
    select max(company_id::text)::uuid, max(contact_id::text)::uuid, max(deal_id::text)::uuid
      into v_company_id, v_contact_id, v_deal_id
    from public.crm_source_references
    where workspace_id = p_workspace_id
      and source_import_id = v_source_import_id
      and source_row_number = v_row_number;

    if v_company_id is not null
       and jsonb_typeof(v_row->'company'->'field_sources') = 'object' then
      update public.crm_companies
      set field_sources = field_sources || (v_row->'company'->'field_sources')
      where workspace_id = p_workspace_id and id = v_company_id and field_sources = '{}'::jsonb;
    end if;

    if v_row->'activities' is null then continue; end if;
    if jsonb_typeof(v_row->'activities') <> 'array' or jsonb_array_length(v_row->'activities') > 10 then
      raise exception 'invalid activities for source row %', v_row_number using errcode = '22023';
    end if;
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
      )
      select p_workspace_id, v_company_id, v_contact_id, v_deal_id,
        v_activity->>'kind', btrim(v_activity->>'body'),
        coalesce(nullif(v_activity->>'occurred_at', '')::timestamptz, now()),
        v_source_import_id, v_row_number, nullif(btrim(v_activity->>'source_column'), ''), v_user_id
      where not exists (
        select 1 from public.crm_activities existing
        where existing.workspace_id = p_workspace_id
          and existing.source_import_id = v_source_import_id
          and existing.source_row_number = v_row_number
          and existing.source_column = nullif(btrim(v_activity->>'source_column'), '')
          and existing.body = btrim(v_activity->>'body')
      );
      get diagnostics v_inserted = row_count;
      v_created := v_created + v_inserted;
    end loop;
  end loop;

  return v_result || jsonb_build_object('created_activities', v_created);
end;
$$;

revoke all on function public.crm_company_field_sources_valid(jsonb) from public, anon;
grant execute on function public.crm_company_field_sources_valid(jsonb) to authenticated, service_role;
