create table public.crm_mailbox_imports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  file_name text not null check (length(btrim(file_name)) between 1 and 500),
  file_size_bytes bigint not null check (file_size_bytes > 0 and file_size_bytes <= 419430400),
  file_fingerprint text not null check (file_fingerprint ~ '^[a-f0-9]{64}$'),
  parser_name text not null check (length(btrim(parser_name)) between 1 and 200),
  message_count integer not null default 0 check (message_count >= 0),
  error_count integer not null default 0 check (error_count >= 0),
  status text not null default 'processing' check (status in ('processing','completed','completed_with_warnings','failed')),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (workspace_id, id), unique (workspace_id, file_fingerprint)
);

create table public.crm_mail_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  mailbox_import_id uuid not null,
  source_key text not null check (length(source_key) between 1 and 200),
  folder_path text not null check (length(folder_path) <= 2000),
  subject text not null default '' check (length(subject) <= 1000),
  sender_email text,
  recipient_emails text[] not null default '{}',
  message_at timestamptz,
  has_attachments boolean not null default false,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (workspace_id, id), unique (workspace_id, mailbox_import_id, source_key),
  foreign key (workspace_id, mailbox_import_id) references public.crm_mailbox_imports(workspace_id, id) on delete cascade
);

create table public.crm_mail_message_contacts (
  workspace_id uuid not null,
  mail_message_id uuid not null,
  contact_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, mail_message_id, contact_id),
  foreign key (workspace_id, mail_message_id) references public.crm_mail_messages(workspace_id, id) on delete cascade,
  foreign key (workspace_id, contact_id) references public.crm_contacts(workspace_id, id) on delete cascade
);

create index crm_mail_messages_import_date_idx on public.crm_mail_messages(workspace_id, mailbox_import_id, message_at desc);
create index crm_mail_messages_subject_search_idx on public.crm_mail_messages using gin(to_tsvector('simple', subject));
create index crm_mail_messages_recipients_idx on public.crm_mail_messages using gin(recipient_emails);

alter table public.crm_mailbox_imports enable row level security;
alter table public.crm_mail_messages enable row level security;
alter table public.crm_mail_message_contacts enable row level security;
revoke all on table public.crm_mailbox_imports, public.crm_mail_messages, public.crm_mail_message_contacts from anon, authenticated;
grant select on table public.crm_mailbox_imports, public.crm_mail_messages, public.crm_mail_message_contacts to authenticated;
grant all on table public.crm_mailbox_imports, public.crm_mail_messages, public.crm_mail_message_contacts to service_role;
create policy crm_mailbox_imports_member_select on public.crm_mailbox_imports for select to authenticated using (exists(select 1 from public.workspace_members m where m.workspace_id=crm_mailbox_imports.workspace_id and m.user_id=auth.uid()));
create policy crm_mail_messages_member_select on public.crm_mail_messages for select to authenticated using (exists(select 1 from public.workspace_members m join public.crm_mailbox_imports i on i.workspace_id=m.workspace_id and i.id=crm_mail_messages.mailbox_import_id where m.workspace_id=crm_mail_messages.workspace_id and m.user_id=auth.uid() and i.status in ('completed','completed_with_warnings')));
create policy crm_mail_message_contacts_member_select on public.crm_mail_message_contacts for select to authenticated using (exists(select 1 from public.workspace_members m join public.crm_mail_messages mm on mm.workspace_id=m.workspace_id and mm.id=crm_mail_message_contacts.mail_message_id join public.crm_mailbox_imports i on i.workspace_id=mm.workspace_id and i.id=mm.mailbox_import_id where m.workspace_id=crm_mail_message_contacts.workspace_id and m.user_id=auth.uid() and i.status in ('completed','completed_with_warnings')));

create or replace function public.crm_begin_mailbox_import(p_workspace_id uuid,p_file_name text,p_file_size_bytes bigint,p_file_fingerprint text,p_parser_name text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_id uuid;
begin
  if v_user is null then raise exception 'authentication required' using errcode='28000'; end if;
  if not exists(select 1 from public.workspace_members m where m.workspace_id=p_workspace_id and m.user_id=v_user) then raise exception 'workspace membership required' using errcode='42501'; end if;
  if p_file_size_bytes<=0 or p_file_size_bytes>419430400 then raise exception 'PST file must be 400 MiB or smaller' using errcode='22023'; end if;
  if coalesce(p_file_fingerprint,'') !~ '^[a-f0-9]{64}$' then raise exception 'invalid file fingerprint' using errcode='22023'; end if;
  select i.id into v_id from public.crm_mailbox_imports i where i.workspace_id=p_workspace_id and i.file_fingerprint=p_file_fingerprint and i.status in ('completed','completed_with_warnings');
  if v_id is not null then return v_id; end if;
  v_id:=null;
  insert into public.crm_mailbox_imports(workspace_id,file_name,file_size_bytes,file_fingerprint,parser_name,created_by)
  values(p_workspace_id,btrim(p_file_name),p_file_size_bytes,p_file_fingerprint,p_parser_name,v_user)
  on conflict(workspace_id,file_fingerprint) do update set file_name=excluded.file_name,file_size_bytes=excluded.file_size_bytes,parser_name=excluded.parser_name,message_count=0,error_count=0,status='processing',completed_at=null
  where crm_mailbox_imports.status not in ('completed','completed_with_warnings') returning id into v_id;
  if v_id is null then select i.id into v_id from public.crm_mailbox_imports i where i.workspace_id=p_workspace_id and i.file_fingerprint=p_file_fingerprint and i.status in ('completed','completed_with_warnings'); end if;
  if v_id is null then raise exception 'mailbox import could not be started' using errcode='40001'; end if;
  delete from public.crm_mail_messages where workspace_id=p_workspace_id and mailbox_import_id=v_id;
  return v_id;
end $$;

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
    v_sender:=case when lower(btrim(coalesce(v_item->>'sender_email',''))) ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then lower(btrim(v_item->>'sender_email')) end;
    select coalesce(array_agg(distinct lower(btrim(value))) filter(where lower(btrim(value)) ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),'{}') into v_recipients from jsonb_array_elements_text(coalesce(v_item->'recipient_emails','[]'::jsonb));
    insert into public.crm_mail_messages(workspace_id,mailbox_import_id,source_key,folder_path,subject,sender_email,recipient_emails,message_at,has_attachments,created_by)
    values(p_workspace_id,p_import_id,left(v_item->>'source_key',200),left(coalesce(v_item->>'folder_path',''),2000),left(coalesce(v_item->>'subject',''),1000),v_sender,v_recipients,nullif(v_item->>'message_at','')::timestamptz,coalesce((v_item->>'has_attachments')::boolean,false),v_user)
    on conflict(workspace_id,mailbox_import_id,source_key) do update set folder_path=excluded.folder_path,subject=excluded.subject,sender_email=excluded.sender_email,recipient_emails=excluded.recipient_emails,message_at=excluded.message_at,has_attachments=excluded.has_attachments
    returning id into v_id;
    delete from public.crm_mail_message_contacts where workspace_id=p_workspace_id and mail_message_id=v_id;
    insert into public.crm_mail_message_contacts(workspace_id,mail_message_id,contact_id)
    select p_workspace_id,v_id,c.id from public.crm_contacts c where c.workspace_id=p_workspace_id and lower(btrim(c.email))=any(array_prepend(v_sender,v_recipients))
    on conflict do nothing;
    v_count:=v_count+1;
  end loop; return v_count;
end $$;

create or replace function public.crm_finish_mailbox_import(p_workspace_id uuid,p_import_id uuid,p_message_count integer,p_error_count integer)
returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_actual_count integer; v_status text;
begin
  if v_user is null or not exists(select 1 from public.workspace_members m where m.workspace_id=p_workspace_id and m.user_id=v_user) then raise exception 'workspace membership required' using errcode='42501'; end if;
  if p_message_count is null or p_message_count<0 or p_error_count is null or p_error_count<0 then raise exception 'mailbox counts must be non-negative' using errcode='22023'; end if;
  select i.status into v_status from public.crm_mailbox_imports i where i.workspace_id=p_workspace_id and i.id=p_import_id;
  if not found then raise exception 'mailbox import not found' using errcode='22023'; end if;
  select count(*)::integer into v_actual_count from public.crm_mail_messages where workspace_id=p_workspace_id and mailbox_import_id=p_import_id;
  if p_message_count<>v_actual_count then raise exception 'mailbox metadata count mismatch' using errcode='22023'; end if;
  if v_status in ('completed','completed_with_warnings') then return; end if;
  if v_status<>'processing' then raise exception 'mailbox import is not processing' using errcode='22023'; end if;
  update public.crm_mailbox_imports set message_count=v_actual_count,error_count=p_error_count,status=case when p_error_count>0 then 'completed_with_warnings' else 'completed' end,completed_at=now()
  where workspace_id=p_workspace_id and id=p_import_id and status='processing';
  if not found then raise exception 'mailbox import not found' using errcode='22023'; end if;
end $$;

create or replace function public.crm_abort_mailbox_import(p_workspace_id uuid,p_import_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();
begin
  if v_user is null or not exists(select 1 from public.workspace_members m where m.workspace_id=p_workspace_id and m.user_id=v_user) then raise exception 'workspace membership required' using errcode='42501'; end if;
  delete from public.crm_mailbox_imports where workspace_id=p_workspace_id and id=p_import_id and status='processing';
end $$;

revoke all on function public.crm_begin_mailbox_import(uuid,text,bigint,text,text),public.crm_ingest_mailbox_metadata(uuid,uuid,jsonb),public.crm_finish_mailbox_import(uuid,uuid,integer,integer),public.crm_abort_mailbox_import(uuid,uuid) from public,anon;
grant execute on function public.crm_begin_mailbox_import(uuid,text,bigint,text,text),public.crm_ingest_mailbox_metadata(uuid,uuid,jsonb),public.crm_finish_mailbox_import(uuid,uuid,integer,integer),public.crm_abort_mailbox_import(uuid,uuid) to authenticated;
