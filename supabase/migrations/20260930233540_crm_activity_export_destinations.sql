drop index if exists public.crm_activities_source_row_column_uidx;
create index if not exists crm_activities_source_row_column_idx
  on public.crm_activities (workspace_id, source_import_id, source_row_number, source_column, occurred_at desc, id)
  where source_import_id is not null;

alter table public.crm_tasks
  add column if not exists activity_id uuid,
  add foreign key (workspace_id, activity_id)
    references public.crm_activities (workspace_id, id) on delete set null (activity_id);

create unique index if not exists crm_tasks_activity_uidx
  on public.crm_tasks (workspace_id, activity_id)
  where activity_id is not null;

create or replace function public.crm_add_activity_with_destination(
  p_workspace_id uuid,
  p_target_kind text,
  p_target_id uuid,
  p_kind text,
  p_body text,
  p_occurred_at timestamptz,
  p_update_last_call boolean default false,
  p_create_task boolean default false,
  p_task_title text default null,
  p_task_due_at timestamptz default null,
  p_task_reminder_at timestamptz default null,
  p_task_assignee_id uuid default null,
  p_source_import_id uuid default null,
  p_source_row_number integer default null,
  p_source_column text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_result jsonb;
  v_activity_id uuid;
  v_task_id uuid;
  v_activity public.crm_activities%rowtype;
  v_source_metadata jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not exists (select 1 from public.workspace_members where workspace_id = p_workspace_id and user_id = auth.uid()) then
    raise exception 'workspace membership required' using errcode = '42501';
  end if;
  if num_nonnulls(p_source_import_id, p_source_row_number, nullif(btrim(p_source_column), '')) not in (0, 3) then
    raise exception 'activity destination must be complete' using errcode = '22023';
  end if;

  if p_source_import_id is not null then
    select source_metadata into v_source_metadata
    from public.crm_source_imports
    where workspace_id = p_workspace_id and id = p_source_import_id;
    if not found then raise exception 'activity destination source is outside this workspace' using errcode = '42501'; end if;

    if not exists (
      select 1 from public.crm_source_references r
      where r.workspace_id = p_workspace_id
        and r.source_import_id = p_source_import_id
        and r.source_row_number = p_source_row_number
        and case p_target_kind
          when 'company' then r.company_id = p_target_id
          when 'contact' then r.contact_id = p_target_id
          when 'deal' then r.deal_id = p_target_id
          else false
        end
    ) then raise exception 'activity destination does not belong to this record row' using errcode = '22023'; end if;

    if not exists (
      select 1 from jsonb_each_text(coalesce(v_source_metadata->'mapping', '{}'::jsonb)) mapped
      where mapped.key in ('callLog', 'remarks', 'comments')
        and mapped.value = btrim(p_source_column)
    ) then raise exception 'activity destination column is not mapped for notes or calls' using errcode = '22023'; end if;
  end if;

  v_result := public.crm_add_activity_with_task(
    p_workspace_id, p_target_kind, p_target_id, p_kind, p_body, p_occurred_at,
    p_update_last_call, p_create_task, p_task_title, p_task_due_at,
    p_task_reminder_at, p_task_assignee_id
  );
  v_activity_id := (v_result->'activity'->>'id')::uuid;
  v_task_id := nullif(v_result->'task'->>'id', '')::uuid;

  update public.crm_activities
  set source_import_id = p_source_import_id,
      source_row_number = p_source_row_number,
      source_column = nullif(btrim(p_source_column), '')
  where workspace_id = p_workspace_id and id = v_activity_id
  returning * into v_activity;

  if v_task_id is not null then
    update public.crm_tasks set activity_id = v_activity_id
    where workspace_id = p_workspace_id and id = v_task_id;
  end if;

  return jsonb_set(v_result, '{activity}', to_jsonb(v_activity));
end;
$$;

revoke all on function public.crm_add_activity_with_destination(uuid, text, uuid, text, text, timestamptz, boolean, boolean, text, timestamptz, timestamptz, uuid, uuid, integer, text) from public, anon;
grant execute on function public.crm_add_activity_with_destination(uuid, text, uuid, text, text, timestamptz, boolean, boolean, text, timestamptz, timestamptz, uuid, uuid, integer, text) to authenticated;
