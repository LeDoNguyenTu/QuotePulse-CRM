drop policy if exists provider_usage_member_select on public.provider_usage_events;
create policy provider_usage_member_select
on public.provider_usage_events
for select
to authenticated
using (
  owner_id = (select auth.uid())
  and (
    workspace_id is null
    or exists (
      select 1
      from public.workspace_members member
      where member.workspace_id = provider_usage_events.workspace_id
        and member.user_id = (select auth.uid())
    )
  )
);

drop policy if exists provider_budget_owner_all on public.provider_budget_settings;
create policy provider_budget_owner_all
on public.provider_budget_settings
for all
to authenticated
using (
  owner_id = (select auth.uid())
  and exists (
    select 1
    from public.workspace_members member
    where member.workspace_id = provider_budget_settings.workspace_id
      and member.user_id = (select auth.uid())
  )
)
with check (
  owner_id = (select auth.uid())
  and exists (
    select 1
    from public.workspace_members member
    where member.workspace_id = provider_budget_settings.workspace_id
      and member.user_id = (select auth.uid())
  )
);
