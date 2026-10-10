set role service_role;

do $$
declare
  child_count integer;
  current_child uuid;
begin
  select count(*) into child_count
  from public.email_sends
  where retry_of = 'eb200000-0000-0000-0000-000000000001';

  select email_send_id into current_child
  from public.crm_campaign_recipients
  where campaign_id = 'eb100000-0000-0000-0000-000000000001'
    and email_normalized = 'race@example.test';

  if child_count <> 1 then
    raise exception 'concurrent retry created % children instead of exactly one', child_count;
  end if;

  if current_child is null or current_child = 'eb200000-0000-0000-0000-000000000001' then
    raise exception 'recipient was not advanced to the single retry child';
  end if;
end;
$$;

delete from public.email_sends where created_by = 'eb000000-0000-0000-0000-000000000001';
delete from public.workspaces where created_by = 'eb000000-0000-0000-0000-000000000001';
delete from auth.users where id = 'eb000000-0000-0000-0000-000000000001';

reset role;
