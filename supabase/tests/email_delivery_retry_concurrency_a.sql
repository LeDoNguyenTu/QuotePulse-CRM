begin;
select set_config('request.jwt.claim.sub', 'eb000000-0000-0000-0000-000000000001', true);
set local role authenticated;

select 1
from public.crm_campaign_recipients
where campaign_id = 'eb100000-0000-0000-0000-000000000001'
  and email_normalized = 'race@example.test'
for update;

select pg_sleep(3);

select public.crm_retry_failed_email_send(
  (select workspace_id from public.crm_email_campaigns where id = 'eb100000-0000-0000-0000-000000000001'),
  'eb200000-0000-0000-0000-000000000001'
);
commit;
