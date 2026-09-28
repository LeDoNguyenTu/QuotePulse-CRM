alter table public.crm_notifications add column reminder_at timestamptz;

create unique index crm_notifications_task_user_generation_uidx
  on public.crm_notifications (workspace_id, task_id, user_id, kind, reminder_at)
  where task_id is not null and reminder_at is not null;

create or replace function public.crm_list_workspace_members(p_workspace_id uuid)
returns table(user_id uuid, role text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, m.role
  from public.workspace_members m
  where m.workspace_id = p_workspace_id
    and exists (
      select 1 from public.workspace_members caller
      where caller.workspace_id = p_workspace_id and caller.user_id = auth.uid()
    )
  order by m.created_at, m.user_id;
$$;

revoke all on function public.crm_list_workspace_members(uuid) from public, anon;
grant execute on function public.crm_list_workspace_members(uuid) to authenticated;

create or replace function public.crm_add_activity_with_task(
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
  p_task_assignee_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_activity public.crm_activities%rowtype;
  v_task public.crm_tasks%rowtype;
begin
  if v_user_id is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not exists (select 1 from public.workspace_members where workspace_id = p_workspace_id and user_id = v_user_id) then
    raise exception 'workspace membership required' using errcode = '42501';
  end if;
  if p_create_task and nullif(btrim(p_task_title), '') is null then
    raise exception 'task title is required' using errcode = '22023';
  end if;
  if p_create_task and p_task_due_at is null then
    raise exception 'task due date is required' using errcode = '22023';
  end if;
  if p_create_task and p_task_assignee_id is not null and not exists (
    select 1 from public.workspace_members where workspace_id = p_workspace_id and user_id = p_task_assignee_id
  ) then raise exception 'task assignee must be a workspace member' using errcode = '22023'; end if;
  if p_create_task and p_task_reminder_at is not null and p_task_reminder_at > p_task_due_at then
    raise exception 'task reminder cannot be after due date' using errcode = '22023';
  end if;

  v_activity := public.crm_add_activity(
    p_workspace_id, p_target_kind, p_target_id, p_kind, p_body,
    p_occurred_at, p_update_last_call
  );

  if p_create_task then
    insert into public.crm_tasks (
      workspace_id, company_id, contact_id, deal_id, title, due_at, reminder_at,
      assignee_id, created_by, updated_by
    ) values (
      p_workspace_id,
      case when p_target_kind = 'company' then p_target_id end,
      case when p_target_kind = 'contact' then p_target_id end,
      case when p_target_kind = 'deal' then p_target_id end,
      btrim(p_task_title), p_task_due_at, p_task_reminder_at,
      coalesce(p_task_assignee_id, v_user_id), v_user_id, v_user_id
    ) returning * into v_task;
  end if;

  return jsonb_build_object('activity', to_jsonb(v_activity), 'task', case when v_task.id is null then null else to_jsonb(v_task) end);
end;
$$;

revoke all on function public.crm_add_activity_with_task(uuid, text, uuid, text, text, timestamptz, boolean, boolean, text, timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.crm_add_activity_with_task(uuid, text, uuid, text, text, timestamptz, boolean, boolean, text, timestamptz, timestamptz, uuid) to authenticated;

create or replace function private.crm_reconcile_task_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('completed', 'cancelled')
    or old.assignee_id is distinct from new.assignee_id
    or old.reminder_at is distinct from new.reminder_at then
    update public.crm_notifications
    set status = 'dismissed', read_at = coalesce(read_at, now())
    where workspace_id = old.workspace_id and task_id = old.id and status = 'unread';
  end if;
  return new;
end;
$$;

revoke all on function private.crm_reconcile_task_notifications() from public, anon, authenticated;
drop trigger if exists crm_tasks_reconcile_notifications on public.crm_tasks;
create trigger crm_tasks_reconcile_notifications
after update on public.crm_tasks
for each row execute function private.crm_reconcile_task_notifications();

create or replace function private.crm_materialize_task_notifications(p_limit integer default 200)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with due_tasks as (
    select t.*
    from public.crm_tasks t
    where t.status in ('open', 'in_progress')
      and t.reminder_at is not null
      and t.reminder_at <= now()
      and t.assignee_id is not null
      and not exists (
        select 1 from public.crm_notifications n
        where n.workspace_id = t.workspace_id and n.task_id = t.id
          and n.user_id = t.assignee_id and n.kind = 'task_reminder'
          and n.reminder_at = t.reminder_at
      )
    order by t.reminder_at, t.id
    limit least(greatest(p_limit, 1), 1000)
    for update skip locked
  )
  insert into public.crm_notifications (
    workspace_id, user_id, task_id, kind, title, body, due_at, reminder_at, created_by
  )
  select workspace_id, assignee_id, id, 'task_reminder', title, description, due_at, reminder_at, updated_by
  from due_tasks
  on conflict (workspace_id, task_id, user_id, kind, reminder_at) where task_id is not null and reminder_at is not null do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function private.crm_materialize_task_notifications(integer) from public, anon, authenticated;
grant execute on function private.crm_materialize_task_notifications(integer) to service_role;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'crm-task-reminders-every-minute';
  perform cron.schedule(
    'crm-task-reminders-every-minute', '* * * * *',
    $job$select private.crm_materialize_task_notifications(200);$job$
  );
end;
$$;
