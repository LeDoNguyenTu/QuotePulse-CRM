create table public.crm_recovery_manifests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  target_kind text not null check(target_kind in('workbook','pst','company','contact','deal','mail_message')),
  target_id uuid not null,
  label text not null check(length(btrim(label)) between 1 and 500),
  state text not null default 'building' check(state in('building','verified','restoring','restored','purging','failed')),
  affected_counts jsonb not null default '{}'::jsonb check(jsonb_typeof(affected_counts)='object'),
  detached_shared integer not null default 0 check(detached_shared>=0),
  archive_r2_key text,
  archive_sha256 text check(archive_sha256 is null or archive_sha256~'^[a-f0-9]{64}$'),
  archive_row_count integer check(archive_row_count is null or archive_row_count>=0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default(now()+interval '30 days'),
  updated_at timestamptz not null default now(),
  hot_deleted_at timestamptz,
  last_error text,
  unique(workspace_id,id)
);
create index crm_recovery_manifests_workspace_expiry_idx on public.crm_recovery_manifests(workspace_id,expires_at,state);
alter table public.crm_recovery_manifests enable row level security;
revoke all on table public.crm_recovery_manifests from anon,authenticated;
grant select on table public.crm_recovery_manifests to authenticated;
grant all on table public.crm_recovery_manifests to service_role;
create policy crm_recovery_member_select on public.crm_recovery_manifests for select to authenticated using(exists(select 1 from public.workspace_members m where m.workspace_id=crm_recovery_manifests.workspace_id and m.user_id=(select auth.uid())));

create or replace function public.crm_apply_recovery_delete(p_manifest_id uuid,p_actor_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare m public.crm_recovery_manifests%rowtype;
begin
  select * into m from public.crm_recovery_manifests where id=p_manifest_id for update;
  if not found or m.state<>'verified' then raise exception 'verified recovery manifest required' using errcode='22023'; end if;
  if not exists(select 1 from public.workspace_members wm where wm.workspace_id=m.workspace_id and wm.user_id=p_actor_id and wm.role in('owner','admin')) then raise exception 'workspace owner or admin required' using errcode='42501'; end if;
  if m.target_kind='workbook' then
    delete from public.crm_deals d where d.workspace_id=m.workspace_id and exists(select 1 from public.crm_source_references r where r.workspace_id=m.workspace_id and r.source_import_id=m.target_id and r.deal_id=d.id) and not exists(select 1 from public.crm_source_references other where other.workspace_id=m.workspace_id and other.deal_id=d.id and other.source_import_id<>m.target_id);
    delete from public.crm_contacts c where c.workspace_id=m.workspace_id and exists(select 1 from public.crm_source_references r where r.workspace_id=m.workspace_id and r.source_import_id=m.target_id and r.contact_id=c.id) and not exists(select 1 from public.crm_source_references other where other.workspace_id=m.workspace_id and other.contact_id=c.id and other.source_import_id<>m.target_id);
    delete from public.crm_companies c where c.workspace_id=m.workspace_id and exists(select 1 from public.crm_source_references r where r.workspace_id=m.workspace_id and r.source_import_id=m.target_id and r.company_id=c.id) and not exists(select 1 from public.crm_source_references other where other.workspace_id=m.workspace_id and other.company_id=c.id and other.source_import_id<>m.target_id);
    delete from public.crm_source_imports where workspace_id=m.workspace_id and id=m.target_id;
  elsif m.target_kind='pst' then delete from public.crm_mailbox_imports where workspace_id=m.workspace_id and id=m.target_id;
  elsif m.target_kind='company' then delete from public.crm_companies where workspace_id=m.workspace_id and id=m.target_id;
  elsif m.target_kind='contact' then delete from public.crm_contacts where workspace_id=m.workspace_id and id=m.target_id;
  elsif m.target_kind='deal' then delete from public.crm_deals where workspace_id=m.workspace_id and id=m.target_id;
  elsif m.target_kind='mail_message' then delete from public.crm_mail_messages where workspace_id=m.workspace_id and id=m.target_id;
  end if;
  update public.crm_recovery_manifests
  set hot_deleted_at=coalesce(hot_deleted_at,now()),updated_at=now()
  where id=m.id and workspace_id=m.workspace_id;
end $$;
revoke all on function public.crm_apply_recovery_delete(uuid,uuid) from public,anon,authenticated;
grant execute on function public.crm_apply_recovery_delete(uuid,uuid) to service_role;

create or replace function public.crm_transition_recovery_manifest(p_manifest_id uuid,p_workspace_id uuid,p_expected text,p_next text,p_actor_id uuid,p_error text default null)
returns public.crm_recovery_manifests language plpgsql security definer set search_path='' as $$
declare result public.crm_recovery_manifests%rowtype;
begin
  if not exists(select 1 from public.workspace_members m where m.workspace_id=p_workspace_id and m.user_id=p_actor_id and m.role in('owner','admin')) then raise exception 'workspace owner or admin required' using errcode='42501'; end if;
  if p_next not in('building','verified','restoring','restored','purging','failed') then raise exception 'invalid recovery state' using errcode='22023'; end if;
  update public.crm_recovery_manifests set state=p_next,last_error=left(p_error,2000),updated_at=now() where id=p_manifest_id and workspace_id=p_workspace_id and state=p_expected returning * into result;
  if not found then raise exception 'recovery state changed; refresh and retry' using errcode='40001'; end if; return result;
end $$;
revoke all on function public.crm_transition_recovery_manifest(uuid,uuid,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.crm_transition_recovery_manifest(uuid,uuid,text,text,uuid,text) to service_role;
