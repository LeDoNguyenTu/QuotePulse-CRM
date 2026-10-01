alter table public.crm_mailbox_imports
  add column archive_r2_key text,
  add column archive_sha256 text check (archive_sha256 is null or archive_sha256 ~ '^[a-f0-9]{64}$'),
  add column archived_at timestamptz;

alter table public.crm_mail_messages
  add column sender_display_name text check (sender_display_name is null or length(sender_display_name) <= 200),
  add column participant_names jsonb not null default '{}'::jsonb check (jsonb_typeof(participant_names) = 'object'),
  add column body_preview text not null default '' check (length(body_preview) <= 500);

create index crm_mailbox_imports_filename_search_idx
  on public.crm_mailbox_imports using gin (file_name extensions.gin_trgm_ops);
create index crm_mail_messages_folder_search_idx
  on public.crm_mail_messages using gin (folder_path extensions.gin_trgm_ops);
create index crm_mail_messages_body_preview_search_idx
  on public.crm_mail_messages using gin (body_preview extensions.gin_trgm_ops);
create unique index crm_contacts_workspace_email_uidx
  on public.crm_contacts (workspace_id, lower(email)) where email is not null;

create or replace function public.crm_ingest_mailbox_metadata(p_workspace_id uuid,p_import_id uuid,p_messages jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_item jsonb; v_id uuid; v_count integer:=0; v_recipients text[]; v_sender text; v_status text;
begin
  if v_user is null then raise exception 'authentication required' using errcode='28000'; end if;
  if not exists(select 1 from public.workspace_members m where m.workspace_id=p_workspace_id and m.user_id=v_user) then raise exception 'workspace membership required' using errcode='42501'; end if;
  if jsonb_typeof(p_messages) is distinct from 'array' or jsonb_array_length(p_messages)>500 then raise exception 'metadata batch must contain at most 500 messages' using errcode='22023'; end if;
  select i.status into v_status from public.crm_mailbox_imports i where i.workspace_id=p_workspace_id and i.id=p_import_id;
  if not found then raise exception 'mailbox import not found' using errcode='22023'; end if;
  if v_status in ('completed','completed_with_warnings') then return jsonb_array_length(p_messages); end if;
  if v_status<>'processing' then raise exception 'mailbox import is not processing' using errcode='22023'; end if;
  for v_item in select value from jsonb_array_elements(p_messages) loop
    if nullif(btrim(v_item->>'source_key'),'') is null then raise exception 'message source key required' using errcode='22023'; end if;
    if jsonb_typeof(coalesce(v_item->'recipient_emails','[]'::jsonb)) is distinct from 'array' or jsonb_array_length(coalesce(v_item->'recipient_emails','[]'::jsonb))>200 then raise exception 'message recipient list must contain at most 200 addresses' using errcode='22023'; end if;
    if jsonb_typeof(coalesce(v_item->'participant_names','{}'::jsonb)) is distinct from 'object' then raise exception 'participant names must be an object' using errcode='22023'; end if;
    v_sender:=case when lower(btrim(coalesce(v_item->>'sender_email',''))) ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then lower(btrim(v_item->>'sender_email')) end;
    select coalesce(array_agg(distinct lower(btrim(value))) filter(where lower(btrim(value)) ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),'{}') into v_recipients from jsonb_array_elements_text(coalesce(v_item->'recipient_emails','[]'::jsonb));
    insert into public.crm_mail_messages(workspace_id,mailbox_import_id,source_key,folder_path,subject,sender_email,sender_display_name,recipient_emails,participant_names,body_preview,message_at,has_attachments,created_by)
    values(p_workspace_id,p_import_id,left(v_item->>'source_key',200),left(coalesce(v_item->>'folder_path',''),2000),left(coalesce(v_item->>'subject',''),1000),v_sender,left(nullif(btrim(v_item->>'sender_display_name'),''),200),v_recipients,coalesce(v_item->'participant_names','{}'::jsonb),left(coalesce(v_item->>'body_preview',''),500),nullif(v_item->>'message_at','')::timestamptz,coalesce((v_item->>'has_attachments')::boolean,false),v_user)
    on conflict(workspace_id,mailbox_import_id,source_key) do update set folder_path=excluded.folder_path,subject=excluded.subject,sender_email=excluded.sender_email,sender_display_name=excluded.sender_display_name,recipient_emails=excluded.recipient_emails,participant_names=excluded.participant_names,body_preview=excluded.body_preview,message_at=excluded.message_at,has_attachments=excluded.has_attachments
    returning id into v_id;
    delete from public.crm_mail_message_contacts where workspace_id=p_workspace_id and mail_message_id=v_id;
    v_count:=v_count+1;
  end loop; return v_count;
end $$;

create or replace function public.crm_finalize_mailbox_archive(
  p_workspace_id uuid, p_import_id uuid, p_archive_r2_key text, p_archive_sha256 text,
  p_message_count integer, p_error_count integer, p_actor_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_import public.crm_mailbox_imports%rowtype; v_actual integer; v_created integer:=0;
begin
  if p_actor_id is null or not exists(select 1 from public.workspace_members m where m.workspace_id=p_workspace_id and m.user_id=p_actor_id) then raise exception 'workspace membership required' using errcode='42501'; end if;
  select * into v_import from public.crm_mailbox_imports where workspace_id=p_workspace_id and id=p_import_id for update;
  if not found or v_import.status<>'processing' then raise exception 'processing mailbox import not found' using errcode='22023'; end if;
  if p_archive_r2_key <> pg_catalog.format('owners/%s/workspaces/%s/crm-mailboxes/%s/manifest.v1.json.gz',v_import.created_by,p_workspace_id,p_import_id) then raise exception 'mailbox archive pointer is outside import scope' using errcode='22023'; end if;
  if p_archive_sha256 !~ '^[a-f0-9]{64}$' then raise exception 'invalid mailbox archive checksum' using errcode='22023'; end if;
  select count(*)::integer into v_actual from public.crm_mail_messages where workspace_id=p_workspace_id and mailbox_import_id=p_import_id;
  if v_actual<>p_message_count then raise exception 'mailbox archive count mismatch' using errcode='22023'; end if;

  with participants as (
    select lower(mm.sender_email) email, nullif(btrim(mm.sender_display_name),'') full_name
    from public.crm_mail_messages mm where mm.workspace_id=p_workspace_id and mm.mailbox_import_id=p_import_id and mm.sender_email is not null
    union all
    select lower(recipient), nullif(btrim(mm.participant_names->>lower(recipient)),'')
    from public.crm_mail_messages mm cross join lateral unnest(mm.recipient_emails) recipient
    where mm.workspace_id=p_workspace_id and mm.mailbox_import_id=p_import_id
  ), unique_participants as (
    select email, max(full_name) full_name from participants where email is not null group by email
  )
  insert into public.crm_contacts(workspace_id,full_name,email,created_by,updated_by)
  select p_workspace_id,full_name,email,p_actor_id,p_actor_id from unique_participants participant
  where not exists(select 1 from public.crm_contacts contact where contact.workspace_id=p_workspace_id and lower(contact.email)=participant.email)
  on conflict do nothing;
  get diagnostics v_created=row_count;

  insert into public.crm_mail_message_contacts(workspace_id,mail_message_id,contact_id)
  select p_workspace_id,message.id,contact.id
  from public.crm_mail_messages message join public.crm_contacts contact
    on contact.workspace_id=p_workspace_id and lower(contact.email)=any(array_prepend(message.sender_email,message.recipient_emails))
  where message.workspace_id=p_workspace_id and message.mailbox_import_id=p_import_id
  on conflict do nothing;

  update public.crm_mailbox_imports set archive_r2_key=p_archive_r2_key,archive_sha256=p_archive_sha256,
    archived_at=now(),message_count=v_actual,error_count=p_error_count,
    status=case when p_error_count>0 then 'completed_with_warnings' else 'completed' end,completed_at=now()
  where workspace_id=p_workspace_id and id=p_import_id;
  return jsonb_build_object('message_count',v_actual,'contacts_created',v_created);
end $$;

revoke all on function public.crm_finalize_mailbox_archive(uuid,uuid,text,text,integer,integer,uuid) from public,anon,authenticated;
grant execute on function public.crm_finalize_mailbox_archive(uuid,uuid,text,text,integer,integer,uuid) to service_role;
revoke execute on function public.crm_finish_mailbox_import(uuid,uuid,integer,integer) from authenticated;
