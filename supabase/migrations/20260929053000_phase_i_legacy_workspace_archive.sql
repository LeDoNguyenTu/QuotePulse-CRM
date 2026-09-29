alter table public.workspace_archives
  add column if not exists restore_status text not null default 'not_started' check (restore_status in ('not_started','restoring','verified','failed')),
  add column if not exists restored_at timestamptz,
  add column if not exists last_error text,
  add column if not exists deletion_checked_at timestamptz,
  add column if not exists source_version bigint not null default 0 check (source_version>=0);

create table public.legacy_data_versions (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  version bigint not null default 0 check (version>=0),
  updated_at timestamptz not null default now()
);
alter table public.legacy_data_versions enable row level security;
revoke all on public.legacy_data_versions from anon,authenticated;
grant all on public.legacy_data_versions to service_role;
insert into public.legacy_data_versions(owner_id,version) select id,0 from auth.users on conflict(owner_id) do nothing;

create or replace function private.bump_legacy_data_version() returns trigger language plpgsql security definer set search_path='' as $$
declare v_owner uuid;
begin
  v_owner:=coalesce(nullif(to_jsonb(new)->>tg_argv[0],''),nullif(to_jsonb(old)->>tg_argv[0],''))::uuid;
  if v_owner is not null then insert into public.legacy_data_versions(owner_id,version) values(v_owner,1) on conflict(owner_id) do update set version=public.legacy_data_versions.version+1,updated_at=now();end if;
  return null;
end $$;
revoke all on function private.bump_legacy_data_version() from public,anon,authenticated;

do $$ declare v_table text;begin
  foreach v_table in array array['companies','email_templates','deals','contacts','kyc_profiles','attachments','uploaded_files','uploaded_file_rows','uploaded_file_merges','job_source_configs','job_opportunities','email_suppressions','company_attachment_archives'] loop
    execute format('drop trigger if exists trg_legacy_archive_version on public.%I',v_table);
    execute format('create trigger trg_legacy_archive_version after insert or update or delete on public.%I for each row execute function private.bump_legacy_data_version(''owner_id'')',v_table);
  end loop;
  drop trigger if exists trg_legacy_archive_version on public.email_sends;
  create trigger trg_legacy_archive_version after insert or update or delete on public.email_sends for each row execute function private.bump_legacy_data_version('created_by');
end $$;

create unique index if not exists workspace_archives_one_building_idx on public.workspace_archives(workspace_id) where status='building';
create unique index if not exists workspace_archives_workspace_id_key on public.workspace_archives(workspace_id,id);

create table public.workspace_archive_tables (
  archive_id uuid not null references public.workspace_archives(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  table_name text not null check (table_name in ('companies','email_templates','deals','contacts','kyc_profiles','attachments','email_sends','uploaded_files','uploaded_file_rows','uploaded_file_merges','job_source_configs','job_opportunities','email_suppressions','company_attachment_archives')),
  restore_order integer not null check (restore_order>0),
  status text not null default 'pending' check (status in ('pending','archiving','verified','failed')),
  cursor_value text,
  high_water text,
  lease_token uuid,
  lease_expires_at timestamptz,
  object_count integer not null default 0 check (object_count>=0),
  row_count bigint not null default 0 check (row_count>=0),
  completed_at timestamptz,
  primary key (archive_id,table_name),
  foreign key (workspace_id,archive_id) references public.workspace_archives(workspace_id,id) on delete cascade
);

create table public.workspace_archive_objects (
  id uuid primary key default gen_random_uuid(),
  archive_id uuid not null,
  workspace_id uuid not null,
  table_name text not null,
  sequence integer not null check (sequence>=0),
  r2_key text not null check (length(r2_key)>0),
  r2_sha256 text not null check (r2_sha256 ~ '^[a-f0-9]{64}$'),
  row_count integer not null check (row_count between 1 and 250),
  first_key text not null,
  last_key text not null,
  status text not null default 'verified' check (status in ('verified','failed')),
  verified_at timestamptz not null,
  restore_status text not null default 'pending' check (restore_status in ('pending','restoring','restored','failed')),
  restore_row_count integer not null default 0 check (restore_row_count>=0),
  restored_at timestamptz,
  deletion_verified_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (archive_id,table_name,sequence),
  unique (r2_key),
  foreign key (archive_id,table_name) references public.workspace_archive_tables(archive_id,table_name) on delete cascade,
  foreign key (workspace_id,archive_id) references public.workspace_archives(workspace_id,id) on delete cascade
);

create index workspace_archive_tables_progress_idx on public.workspace_archive_tables(archive_id,status,restore_order);
create index workspace_archive_objects_restore_idx on public.workspace_archive_objects(archive_id,restore_status,table_name,sequence);

alter table public.workspace_archive_tables enable row level security;
alter table public.workspace_archive_objects enable row level security;
revoke all on public.workspace_archive_tables,public.workspace_archive_objects from anon,authenticated;
grant select on public.workspace_archive_tables,public.workspace_archive_objects to authenticated;
grant all on public.workspace_archive_tables,public.workspace_archive_objects to service_role;
create policy workspace_archive_tables_member_select on public.workspace_archive_tables for select to authenticated using(exists(select 1 from public.workspace_members m where m.workspace_id=workspace_archive_tables.workspace_id and m.user_id=auth.uid()));
create policy workspace_archive_objects_member_select on public.workspace_archive_objects for select to authenticated using(exists(select 1 from public.workspace_members m where m.workspace_id=workspace_archive_objects.workspace_id and m.user_id=auth.uid()));

create or replace function public.begin_legacy_workspace_archive(p_workspace_id uuid,p_tables jsonb,p_schema_version text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_archive uuid;v_table jsonb;
begin
  if v_user is null then raise exception 'authentication required' using errcode='28000';end if;
  if not exists(select 1 from public.workspaces w join public.workspace_members m on m.workspace_id=w.id where w.id=p_workspace_id and w.kind='legacy' and w.created_by=v_user and m.user_id=v_user and m.role='owner') then raise exception 'legacy workspace owner required' using errcode='42501';end if;
  if p_schema_version<>'quotepulse-legacy-v1' or jsonb_typeof(p_tables) is distinct from 'array' or jsonb_array_length(p_tables)<1 or jsonb_array_length(p_tables)>14 then raise exception 'valid archive table manifest required' using errcode='22023';end if;
  select id into v_archive from public.workspace_archives where workspace_id=p_workspace_id and status='building' order by created_at desc limit 1;
  if v_archive is null then insert into public.workspace_archives(workspace_id,archive_version,schema_version,status,created_by,source_version) values(p_workspace_id,1,p_schema_version,'building',v_user,coalesce((select version from public.legacy_data_versions where owner_id=v_user),0)) returning id into v_archive;end if;
  for v_table in select value from jsonb_array_elements(p_tables) loop
    insert into public.workspace_archive_tables(archive_id,workspace_id,table_name,restore_order) values(v_archive,p_workspace_id,v_table->>'table',greatest(1,(v_table->>'restore_order')::integer)) on conflict do nothing;
  end loop;
  return v_archive;
end $$;

revoke all on function public.begin_legacy_workspace_archive(uuid,jsonb,text) from public,anon;
grant execute on function public.begin_legacy_workspace_archive(uuid,jsonb,text) to authenticated;

create or replace function public.finalize_legacy_workspace_archive(p_archive_id uuid,p_owner_id uuid,p_manifest_key text,p_manifest_sha256 text,p_table_counts jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare v_version bigint;v_source bigint;
begin
  select version into v_version from public.legacy_data_versions where owner_id=p_owner_id for update;
  select source_version into v_source from public.workspace_archives where id=p_archive_id and created_by=p_owner_id and status='building' for update;
  if not found then raise exception 'building workspace archive not found' using errcode='22023';end if;
  if coalesce(v_version,0)<>v_source then update public.workspace_archives set status='failed',last_error='Legacy data changed while the archive was being built.' where id=p_archive_id;raise exception 'legacy data changed during archive capture' using errcode='40001';end if;
  if coalesce(p_manifest_key,'')='' or coalesce(p_manifest_sha256,'')!~'^[a-f0-9]{64}$' or jsonb_typeof(p_table_counts) is distinct from 'object' then raise exception 'invalid verified archive manifest' using errcode='22023';end if;
  update public.workspace_archives set status='verified',manifest_key=p_manifest_key,manifest_sha256=p_manifest_sha256,table_counts=p_table_counts,verified_at=now(),last_error=null where id=p_archive_id;
end $$;
revoke all on function public.finalize_legacy_workspace_archive(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.finalize_legacy_workspace_archive(uuid,uuid,text,text,jsonb) to service_role;

create or replace function public.mark_legacy_workspace_archive_deletion_eligible(p_archive_id uuid,p_owner_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_version bigint;v_source bigint;
begin
  select version into v_version from public.legacy_data_versions where owner_id=p_owner_id for update;
  select source_version into v_source from public.workspace_archives where id=p_archive_id and created_by=p_owner_id and status in ('verified','deletion_eligible') for update;
  if not found then raise exception 'verified workspace archive not found' using errcode='22023';end if;
  if v_version<>v_source then raise exception 'legacy data changed after archive capture' using errcode='40001';end if;
  if exists(select 1 from public.workspace_archive_objects where archive_id=p_archive_id and (status<>'verified' or deletion_verified_at is null)) then raise exception 'archive object verification is incomplete' using errcode='22023';end if;
  update public.workspace_archives set status='deletion_eligible',deletion_checked_at=now() where id=p_archive_id;
end $$;
revoke all on function public.mark_legacy_workspace_archive_deletion_eligible(uuid,uuid) from public,anon,authenticated;
grant execute on function public.mark_legacy_workspace_archive_deletion_eligible(uuid,uuid) to service_role;
