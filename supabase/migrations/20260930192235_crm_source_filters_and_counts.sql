create or replace function public.crm_list_companies(
  p_workspace_id uuid,
  p_source_import_id uuid default null,
  p_search text default '',
  p_industry text default null,
  p_sort text default 'name_asc',
  p_offset integer default 0,
  p_limit integer default 25
)
returns table (row_data jsonb, total_count bigint)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not exists (select 1 from public.workspace_members wm where wm.workspace_id = p_workspace_id and wm.user_id = auth.uid()) then
    raise exception 'workspace membership required' using errcode = '42501';
  end if;
  if p_offset < 0 or p_limit not between 1 and 100 then raise exception 'invalid page range' using errcode = '22023'; end if;

  return query
  with filtered as (
    select c.*
    from public.crm_companies c
    where c.workspace_id = p_workspace_id
      and (coalesce(btrim(p_search), '') = '' or position(lower(btrim(p_search)) in lower(c.name)) > 0)
      and (nullif(btrim(p_industry), '') is null or c.industry = btrim(p_industry))
      and (p_source_import_id is null or exists (
        select 1 from public.crm_source_references rf
        where rf.workspace_id = p_workspace_id and rf.source_import_id = p_source_import_id and rf.company_id = c.id
      ))
  ), paged as (
    select f.*, count(*) over () as full_count
    from filtered f
    order by
      case when p_sort = 'name_desc' then lower(f.name) end desc,
      case when p_sort = 'recent' then f.created_at end desc,
      case when p_sort not in ('name_desc', 'recent') then lower(f.name) end asc,
      f.id asc
    offset p_offset limit p_limit
  )
  select to_jsonb(p) - 'full_count' || jsonb_build_object(
      'primary_source', src.primary_source,
      'source_count', coalesce(src.source_count, 0),
      'source_row_number', src.source_row_number,
      'contact_count', (select count(*) from public.crm_contacts cc where cc.workspace_id = p_workspace_id and cc.company_id = p.id),
      'deal_count', (select count(*) from public.crm_deals cd where cd.workspace_id = p_workspace_id and cd.company_id = p.id),
      'task_count', (select count(*) from public.crm_tasks ct where ct.workspace_id = p_workspace_id and ct.company_id = p.id)
    ), p.full_count
  from paged p
  left join lateral (
    select count(distinct r.source_import_id)::integer as source_count,
      min(r.source_row_number) filter (where r.source_import_id = p_source_import_id) as source_row_number,
      (select jsonb_build_object(
          'id', si.id, 'database_id', si.database_id, 'filename', si.original_filename,
          'source_type', coalesce(si.source_metadata->>'source_type', 'workbook'),
          'headers', coalesce(si.source_metadata->'headers', '[]'::jsonb),
          'row_index_available', si.source_metadata ? 'row_index_r2_key'
        )
       from public.crm_source_references rr join public.crm_source_imports si
         on si.workspace_id = rr.workspace_id and si.id = rr.source_import_id
       where rr.workspace_id = p_workspace_id and rr.company_id = p.id
       order by (rr.source_import_id = p_source_import_id) desc, rr.created_at desc, rr.id desc limit 1) as primary_source
    from public.crm_source_references r where r.workspace_id = p_workspace_id and r.company_id = p.id
  ) src on true;
end;
$$;

create or replace function public.crm_list_contacts(
  p_workspace_id uuid,
  p_source_import_id uuid default null,
  p_search text default '',
  p_company_id uuid default null,
  p_sort text default 'name_asc',
  p_offset integer default 0,
  p_limit integer default 25
)
returns table (row_data jsonb, total_count bigint)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not exists (select 1 from public.workspace_members wm where wm.workspace_id = p_workspace_id and wm.user_id = auth.uid()) then
    raise exception 'workspace membership required' using errcode = '42501';
  end if;
  if p_offset < 0 or p_limit not between 1 and 100 then raise exception 'invalid page range' using errcode = '22023'; end if;

  return query
  with filtered as (
    select c.*
    from public.crm_contacts c
    where c.workspace_id = p_workspace_id
      and (coalesce(btrim(p_search), '') = '' or position(lower(btrim(p_search)) in lower(coalesce(c.full_name, c.email, ''))) > 0)
      and (p_company_id is null or c.company_id = p_company_id)
      and (p_source_import_id is null or exists (
        select 1 from public.crm_source_references rf
        where rf.workspace_id = p_workspace_id and rf.source_import_id = p_source_import_id and rf.contact_id = c.id
      ))
  ), paged as (
    select f.*, count(*) over () as full_count
    from filtered f
    order by
      case when p_sort = 'name_desc' then lower(coalesce(f.full_name, f.email, '')) end desc,
      case when p_sort = 'recent' then f.created_at end desc,
      case when p_sort not in ('name_desc', 'recent') then lower(coalesce(f.full_name, f.email, '')) end asc,
      f.id asc
    offset p_offset limit p_limit
  )
  select to_jsonb(p) - 'full_count' || jsonb_build_object(
      'company', case when company.id is null then null else jsonb_build_object('id', company.id, 'name', company.name, 'industry', company.industry) end,
      'primary_source', src.primary_source,
      'source_count', coalesce(src.source_count, 0),
      'source_row_number', src.source_row_number,
      'deal_count', (select count(*) from public.crm_deal_contacts dc where dc.workspace_id = p_workspace_id and dc.contact_id = p.id),
      'task_count', (select count(*) from public.crm_tasks ct where ct.workspace_id = p_workspace_id and ct.contact_id = p.id)
    ), p.full_count
  from paged p
  left join public.crm_companies company on company.workspace_id = p.workspace_id and company.id = p.company_id
  left join lateral (
    select count(distinct r.source_import_id)::integer as source_count,
      min(r.source_row_number) filter (where r.source_import_id = p_source_import_id) as source_row_number,
      (select jsonb_build_object(
          'id', si.id, 'database_id', si.database_id, 'filename', si.original_filename,
          'source_type', coalesce(si.source_metadata->>'source_type', 'workbook'),
          'headers', coalesce(si.source_metadata->'headers', '[]'::jsonb),
          'row_index_available', si.source_metadata ? 'row_index_r2_key'
        )
       from public.crm_source_references rr join public.crm_source_imports si
         on si.workspace_id = rr.workspace_id and si.id = rr.source_import_id
       where rr.workspace_id = p_workspace_id and rr.contact_id = p.id
       order by (rr.source_import_id = p_source_import_id) desc, rr.created_at desc, rr.id desc limit 1) as primary_source
    from public.crm_source_references r where r.workspace_id = p_workspace_id and r.contact_id = p.id
  ) src on true;
end;
$$;

create or replace function public.crm_list_deals(
  p_workspace_id uuid,
  p_source_import_id uuid default null,
  p_search text default '',
  p_status text default null,
  p_company_id uuid default null,
  p_sort text default 'recent',
  p_offset integer default 0,
  p_limit integer default 25
)
returns table (row_data jsonb, total_count bigint)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not exists (select 1 from public.workspace_members wm where wm.workspace_id = p_workspace_id and wm.user_id = auth.uid()) then
    raise exception 'workspace membership required' using errcode = '42501';
  end if;
  if p_offset < 0 or p_limit not between 1 and 100 then raise exception 'invalid page range' using errcode = '22023'; end if;

  return query
  with filtered as (
    select d.*
    from public.crm_deals d
    where d.workspace_id = p_workspace_id
      and (coalesce(btrim(p_search), '') = '' or position(lower(btrim(p_search)) in lower(d.name)) > 0)
      and (nullif(btrim(p_status), '') is null or d.status = btrim(p_status))
      and (p_company_id is null or d.company_id = p_company_id)
      and (p_source_import_id is null or exists (
        select 1 from public.crm_source_references rf
        where rf.workspace_id = p_workspace_id and rf.source_import_id = p_source_import_id and rf.deal_id = d.id
      ))
  ), paged as (
    select f.*, count(*) over () as full_count
    from filtered f
    order by
      case when p_sort = 'value_desc' then f.amount end desc nulls last,
      case when p_sort = 'follow_up' then f.follow_up_at end asc nulls last,
      case when p_sort not in ('value_desc', 'follow_up') then f.created_at end desc,
      f.id asc
    offset p_offset limit p_limit
  )
  select to_jsonb(p) - 'full_count' || jsonb_build_object(
      'company', case when company.id is null then null else jsonb_build_object('id', company.id, 'name', company.name) end,
      'primary_source', src.primary_source,
      'source_count', coalesce(src.source_count, 0),
      'source_row_number', src.source_row_number,
      'task_count', (select count(*) from public.crm_tasks ct where ct.workspace_id = p_workspace_id and ct.deal_id = p.id)
    ), p.full_count
  from paged p
  left join public.crm_companies company on company.workspace_id = p.workspace_id and company.id = p.company_id
  left join lateral (
    select count(distinct r.source_import_id)::integer as source_count,
      min(r.source_row_number) filter (where r.source_import_id = p_source_import_id) as source_row_number,
      (select jsonb_build_object(
          'id', si.id, 'database_id', si.database_id, 'filename', si.original_filename,
          'source_type', coalesce(si.source_metadata->>'source_type', 'workbook'),
          'headers', coalesce(si.source_metadata->'headers', '[]'::jsonb),
          'row_index_available', si.source_metadata ? 'row_index_r2_key'
        )
       from public.crm_source_references rr join public.crm_source_imports si
         on si.workspace_id = rr.workspace_id and si.id = rr.source_import_id
       where rr.workspace_id = p_workspace_id and rr.deal_id = p.id
       order by (rr.source_import_id = p_source_import_id) desc, rr.created_at desc, rr.id desc limit 1) as primary_source
    from public.crm_source_references r where r.workspace_id = p_workspace_id and r.deal_id = p.id
  ) src on true;
end;
$$;

revoke all on function public.crm_list_companies(uuid, uuid, text, text, text, integer, integer) from public, anon;
revoke all on function public.crm_list_contacts(uuid, uuid, text, uuid, text, integer, integer) from public, anon;
revoke all on function public.crm_list_deals(uuid, uuid, text, text, uuid, text, integer, integer) from public, anon;
grant execute on function public.crm_list_companies(uuid, uuid, text, text, text, integer, integer) to authenticated;
grant execute on function public.crm_list_contacts(uuid, uuid, text, uuid, text, integer, integer) to authenticated;
grant execute on function public.crm_list_deals(uuid, uuid, text, text, uuid, text, integer, integer) to authenticated;
