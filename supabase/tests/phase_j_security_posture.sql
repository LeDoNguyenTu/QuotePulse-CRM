begin;

do $$
declare
  expected_tables text[] := array[
    'workspaces', 'workspace_members', 'workspace_archives',
    'crm_companies', 'crm_contacts', 'crm_deals', 'crm_deal_contacts',
    'crm_activities', 'crm_tasks', 'crm_notifications', 'crm_source_imports',
    'crm_source_references', 'crm_email_campaigns', 'crm_campaign_recipients',
    'crm_mailbox_imports', 'crm_mail_messages', 'crm_mail_message_contacts'
  ];
  table_name text;
  policy_count integer;
begin
  foreach table_name in array expected_tables loop
    if not exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = table_name and c.relrowsecurity
    ) then
      raise exception 'RLS is not enabled on public.%', table_name;
    end if;

    if has_table_privilege('anon', format('public.%I', table_name), 'select') then
      raise exception 'anonymous role can read public.%', table_name;
    end if;

    select count(*) into policy_count
    from pg_policies
    where schemaname = 'public' and tablename = table_name;
    if policy_count = 0 then
      raise exception 'public.% has no RLS policy', table_name;
    end if;
  end loop;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'crm_activities_company_timeline_idx'
  ) or not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'crm_activities_deal_timeline_idx'
  ) then
    raise exception 'Phase J activity timeline indexes are missing';
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.prosecdef
      and not exists (
        select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) setting
        where setting like 'search_path=%'
      )
  ) then
    raise exception 'security-definer function without an explicit approved search_path exists';
  end if;
end;
$$;

rollback;
