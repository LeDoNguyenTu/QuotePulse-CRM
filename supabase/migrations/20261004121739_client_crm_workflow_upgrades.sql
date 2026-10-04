-- Additive CRM workflow fields for customer lifecycle, repeat workbook imports,
-- editable activities, and rich email templates.

alter table public.crm_companies
  add column customer_status text
    check (customer_status is null or length(btrim(customer_status)) between 1 and 120);

alter table public.crm_contacts
  add column record_state text not null default 'unverified'
    check (record_state in ('unverified', 'verified', 'outdated')),
  add column is_hidden boolean not null default false,
  add column duplicate_review_of uuid,
  add constraint crm_contacts_duplicate_review_not_self
    check (duplicate_review_of is null or duplicate_review_of <> id),
  add constraint crm_contacts_duplicate_review_workspace_fkey
    foreign key (workspace_id, duplicate_review_of)
    references public.crm_contacts (workspace_id, id)
    on delete set null (duplicate_review_of);

alter table public.crm_deals
  add column call_outcome text
    check (call_outcome is null or length(btrim(call_outcome)) between 1 and 160),
  add column appointment_status text
    check (appointment_status is null or length(btrim(appointment_status)) between 1 and 160);

alter table public.crm_activities
  add column call_outcome text
    check (call_outcome is null or length(btrim(call_outcome)) between 1 and 160),
  add column updated_by uuid references auth.users(id) on delete restrict,
  add column updated_at timestamptz not null default now();

update public.crm_activities
set updated_by = created_by
where updated_by is null;

alter table public.crm_activities
  alter column updated_by set default auth.uid(),
  alter column updated_by set not null;

create trigger crm_activities_updated_at before update on public.crm_activities
for each row execute function public.set_updated_at();

create or replace function public.crm_short_database_id()
returns text
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea := pg_catalog.uuid_send(pg_catalog.gen_random_uuid());
  v_result text := 'DB-';
  v_index integer;
begin
  for v_index in 1..6 loop
    v_result := v_result || pg_catalog.substr(
      v_alphabet,
      (pg_catalog.get_byte(v_bytes, v_index - 1) % 32) + 1,
      1
    );
  end loop;
  return v_result;
end;
$$;

revoke all on function public.crm_short_database_id() from public, anon;
grant execute on function public.crm_short_database_id() to authenticated, service_role;

alter table public.crm_source_imports
  add column workbook_identity text
    check (workbook_identity is null or workbook_identity ~ '^[a-f0-9]{64}$'),
  add column latest_revision integer not null default 1
    check (latest_revision > 0),
  alter column database_id set default public.crm_short_database_id(),
  drop constraint if exists crm_source_imports_database_id_check,
  add constraint crm_source_imports_database_id_check
    check (database_id ~ '^(CRM-[A-Z0-9]{12}|DB-[A-HJ-NP-Z2-9]{6})$');

alter table public.crm_source_references
  add column stable_row_fingerprint text
    check (stable_row_fingerprint is null or stable_row_fingerprint ~ '^[a-f0-9]{64}$');

create table public.crm_source_revisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source_import_id uuid not null,
  revision_number integer not null check (revision_number > 0),
  checksum_sha256 text check (checksum_sha256 is null or checksum_sha256 ~ '^[a-f0-9]{64}$'),
  row_count integer not null default 0 check (row_count >= 0),
  source_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(source_metadata) = 'object'),
  imported_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (workspace_id, source_import_id, revision_number),
  foreign key (workspace_id, source_import_id)
    references public.crm_source_imports (workspace_id, id) on delete cascade
);

alter table public.email_templates
  add column body_format text not null default 'plain'
    check (body_format in ('plain', 'html')),
  add column body_html text,
  add column asset_manifest jsonb not null default '[]'::jsonb
    check (jsonb_typeof(asset_manifest) = 'array'),
  add constraint email_templates_html_body_check
    check (body_format <> 'html' or nullif(btrim(body_html), '') is not null);

create index crm_contacts_workspace_state_visibility_idx
  on public.crm_contacts (workspace_id, is_hidden, record_state, id);
create index crm_contacts_workspace_duplicate_review_idx
  on public.crm_contacts (workspace_id, duplicate_review_of)
  where duplicate_review_of is not null;
create index crm_source_imports_workspace_identity_idx
  on public.crm_source_imports (workspace_id, workbook_identity, latest_revision desc)
  where workbook_identity is not null;
create unique index crm_source_references_stable_row_entity_uidx
  on public.crm_source_references (
    workspace_id,
    source_import_id,
    stable_row_fingerprint,
    (case
      when company_id is not null then 'company'
      when contact_id is not null then 'contact'
      else 'deal'
    end)
  )
  where stable_row_fingerprint is not null;
create index crm_activities_workspace_company_occurred_idx
  on public.crm_activities (workspace_id, company_id, occurred_at desc, id)
  where company_id is not null;
create index crm_notifications_workspace_user_due_idx
  on public.crm_notifications (workspace_id, user_id, status, due_at, id);
create index crm_source_revisions_workspace_import_idx
  on public.crm_source_revisions (workspace_id, source_import_id, revision_number desc);

alter table public.crm_source_revisions enable row level security;

revoke all on table public.crm_source_revisions from anon, authenticated;
grant select, insert, delete on table public.crm_source_revisions to authenticated;
grant all on table public.crm_source_revisions to service_role;

create policy crm_source_revisions_select_member
on public.crm_source_revisions for select to authenticated
using (
  exists (
    select 1 from public.workspace_members m
    where m.workspace_id = crm_source_revisions.workspace_id
      and m.user_id = (select auth.uid())
  )
);

create policy crm_source_revisions_insert_member
on public.crm_source_revisions for insert to authenticated
with check (
  imported_by = (select auth.uid())
  and exists (
    select 1 from public.workspace_members m
    where m.workspace_id = crm_source_revisions.workspace_id
      and m.user_id = (select auth.uid())
  )
);

create policy crm_source_revisions_delete_admin
on public.crm_source_revisions for delete to authenticated
using (
  exists (
    select 1 from public.workspace_members m
    where m.workspace_id = crm_source_revisions.workspace_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')
  )
);
