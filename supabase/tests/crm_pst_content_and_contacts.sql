begin;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('8d000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pst@example.test','','{}','{}',now(),now());
select set_config('request.jwt.claim.sub','8d000000-0000-0000-0000-000000000001',true);
set local role authenticated;
do $$ declare w uuid; i uuid; begin
  select id into w from public.workspaces where kind='sales_crm' and created_by='8d000000-0000-0000-0000-000000000001';
  i:=public.crm_begin_mailbox_import(w,'sales.pst',100,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','test-parser');
  perform public.crm_ingest_mailbox_metadata(w,i,jsonb_build_array(jsonb_build_object(
    'source_key','1','folder_path','/Inbox','subject','Hello','sender_email','A@example.com',
    'sender_display_name','Alice','recipient_emails',jsonb_build_array('b@example.com'),
    'participant_names',jsonb_build_object('b@example.com','Bob'),'body_preview','Message preview','has_attachments',false
  )));
  perform set_config('test.pst_workspace',w::text,true); perform set_config('test.pst_import',i::text,true);
end $$;
reset role;
set local role service_role;
select public.crm_finalize_mailbox_archive(
  current_setting('test.pst_workspace')::uuid,current_setting('test.pst_import')::uuid,
  format('owners/%s/workspaces/%s/crm-mailboxes/%s/manifest.v1.json.gz','8d000000-0000-0000-0000-000000000001',current_setting('test.pst_workspace'),current_setting('test.pst_import')),
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',1,0,'8d000000-0000-0000-0000-000000000001'
);
do $$ begin
  if (select count(*) from public.crm_contacts where workspace_id=current_setting('test.pst_workspace')::uuid and lower(email) in ('a@example.com','b@example.com'))<>2 then raise exception 'PST contacts were not created'; end if;
  if (select status from public.crm_mailbox_imports where id=current_setting('test.pst_import')::uuid)<>'completed' then raise exception 'PST import was not finalized'; end if;
end $$;
reset role;
rollback;
