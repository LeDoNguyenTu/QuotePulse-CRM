begin;
select set_config('request.jwt.claim.sub', 'eb000000-0000-0000-0000-000000000001', true);
set local role authenticated;

select 1
from public.email_sends
where id = 'eb200000-0000-0000-0000-000000000001'
for update;

select pg_sleep(3);

select public.crm_retry_failed_email_send(
  (select workspace_id from public.crm_email_campaigns where id = 'eb100000-0000-0000-0000-000000000001'),
  'eb200000-0000-0000-0000-000000000001'
);
commit;
