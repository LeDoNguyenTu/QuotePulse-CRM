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

alter table public.crm_source_references
  add column source_revision_id uuid,
  add constraint crm_source_references_revision_workspace_fkey
    foreign key (workspace_id, source_revision_id)
    references public.crm_source_revisions (workspace_id, id) on delete cascade;

alter table public.crm_activities
  add column source_revision_id uuid,
  add column stable_row_fingerprint text
    check (stable_row_fingerprint is null or stable_row_fingerprint ~ '^[a-f0-9]{64}$'),
  add constraint crm_activities_revision_workspace_fkey
    foreign key (workspace_id, source_revision_id)
    references public.crm_source_revisions (workspace_id, id) on delete set null (source_revision_id);

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
create unique index crm_source_imports_workspace_identity_idx
  on public.crm_source_imports (workspace_id, workbook_identity)
  where workbook_identity is not null;
create unique index crm_source_references_stable_row_entity_uidx
  on public.crm_source_references (
    workspace_id,
    source_revision_id,
    stable_row_fingerprint,
    (case
      when company_id is not null then 'company'
      when contact_id is not null then 'contact'
      else 'deal'
    end)
  )
  where source_revision_id is not null and stable_row_fingerprint is not null;
create unique index crm_activities_revision_row_column_uidx
  on public.crm_activities (workspace_id, source_revision_id, stable_row_fingerprint, source_column)
  where source_revision_id is not null and stable_row_fingerprint is not null and source_column is not null;
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

create or replace function public.crm_company_field_sources_valid(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(value) = 'object'
    and not exists (
      select 1 from jsonb_each_text(value) entry
      where entry.key not in (
        'name', 'industry', 'website', 'domain', 'phone', 'address_line_1',
        'address_line_2', 'city', 'state_region', 'postal_code', 'country', 'customer_status'
      ) or entry.value not in ('user', 'workbook', 'classifier', 'enrichment', 'legacy')
    );
$$;

create or replace function public.crm_track_company_user_sources()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  field_name text;
begin
  if pg_catalog.current_setting('app.crm_write_source', true) = 'workbook' then
    return new;
  end if;
  foreach field_name in array array[
    'name', 'industry', 'website', 'domain', 'phone', 'address_line_1',
    'address_line_2', 'city', 'state_region', 'postal_code', 'country', 'customer_status'
  ] loop
    if to_jsonb(new)->field_name is distinct from to_jsonb(old)->field_name
       and new.field_sources->field_name is not distinct from old.field_sources->field_name then
      if nullif(btrim(to_jsonb(new)->>field_name), '') is null then
        new.field_sources := new.field_sources - field_name;
      else
        new.field_sources := jsonb_set(new.field_sources, array[field_name], '"user"'::jsonb, true);
      end if;
    end if;
  end loop;
  return new;
end;
$$;

drop function public.crm_commit_import_with_activities(uuid, text, text, text, integer, jsonb);

create function public.crm_commit_import_with_activities(
  p_workspace_id uuid,
  p_original_filename text,
  p_sheet_name text,
  p_checksum_sha256 text,
  p_source_row_count integer,
  p_workbook_identity text,
  p_rows jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_import public.crm_source_imports%rowtype;
  v_revision_id uuid;
  v_revision_number integer;
  v_row jsonb;
  v_activity jsonb;
  v_row_number integer;
  v_fingerprint text;
  v_company_id uuid;
  v_contact_id uuid;
  v_deal_id uuid;
  v_duplicate_contact_id uuid;
  v_activity_id uuid;
  v_company_name text;
  v_email text;
  v_full_name text;
  v_phone text;
  v_before jsonb;
  v_after jsonb;
  v_activity_changed boolean;
  v_had_prior boolean;
  v_row_created boolean;
  v_row_changed boolean;
  v_row_matched boolean;
  v_attempt integer;
  v_created_companies integer := 0;
  v_created_contacts integer := 0;
  v_created_deals integer := 0;
  v_created_activities integer := 0;
  v_created_rows integer := 0;
  v_updated_rows integer := 0;
  v_unchanged_rows integer := 0;
  v_duplicate_review_rows integer := 0;
  v_matched_rows integer := 0;
  v_warning_count integer := 0;
begin
  if v_user_id is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = p_workspace_id and wm.user_id = v_user_id
  ) then raise exception 'workspace membership required' using errcode = '42501'; end if;
  if p_original_filename is null or length(btrim(p_original_filename)) not between 1 and 500 then
    raise exception 'invalid source filename' using errcode = '22023';
  end if;
  if p_workbook_identity is null or p_workbook_identity !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid workbook identity' using errcode = '22023';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) < 1 or jsonb_array_length(p_rows) > 20000 then
    raise exception 'import rows must contain between 1 and 20000 records' using errcode = '22023';
  end if;
  if p_source_row_count < jsonb_array_length(p_rows) or p_source_row_count > 20000 then
    raise exception 'invalid source row count' using errcode = '22023';
  end if;
  if p_checksum_sha256 is not null and p_checksum_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid SHA-256 checksum' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text || ':' || p_workbook_identity, 0));
  perform pg_catalog.set_config('app.crm_write_source', 'workbook', true);

  select source.* into v_import
  from public.crm_source_imports source
  where source.workspace_id = p_workspace_id
    and (
      source.workbook_identity = p_workbook_identity
      or (
        source.workbook_identity is null
        and lower(regexp_replace(btrim(source.original_filename), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(p_original_filename), '\s+', ' ', 'g'))
        and lower(regexp_replace(btrim(coalesce(source.sheet_name, '')), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(coalesce(p_sheet_name, '')), '\s+', ' ', 'g'))
      )
    )
  order by (source.workbook_identity = p_workbook_identity) desc, source.created_at desc
  limit 1
  for update;

  if v_import.id is null then
    for v_attempt in 1..5 loop
      begin
        insert into public.crm_source_imports (
          workspace_id, original_filename, sheet_name, row_count, checksum_sha256,
          workbook_identity, latest_revision, source_metadata, imported_by, created_by
        ) values (
          p_workspace_id, btrim(p_original_filename), nullif(btrim(p_sheet_name), ''),
          p_source_row_count, p_checksum_sha256, p_workbook_identity, 1,
          jsonb_build_object('format', 'source-preserving-crm-import-v4'), v_user_id, v_user_id
        ) returning * into v_import;
        exit;
      exception when unique_violation then
        if v_attempt = 5 then raise; end if;
      end;
    end loop;
    v_revision_number := 1;
  else
    v_revision_number := v_import.latest_revision + 1;
    update public.crm_source_imports
    set original_filename = btrim(p_original_filename),
        sheet_name = nullif(btrim(p_sheet_name), ''),
        row_count = p_source_row_count,
        checksum_sha256 = p_checksum_sha256,
        workbook_identity = p_workbook_identity,
        latest_revision = v_revision_number,
        imported_by = v_user_id
    where workspace_id = p_workspace_id and id = v_import.id
    returning * into v_import;
  end if;

  insert into public.crm_source_revisions (
    workspace_id, source_import_id, revision_number, checksum_sha256, row_count,
    source_metadata, imported_by
  ) values (
    p_workspace_id, v_import.id, v_revision_number, p_checksum_sha256, p_source_row_count,
    jsonb_build_object('filename', btrim(p_original_filename), 'sheet_name', nullif(btrim(p_sheet_name), '')),
    v_user_id
  ) returning id into v_revision_id;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_row_number := nullif(v_row->>'rowNumber', '')::integer;
    v_fingerprint := nullif(v_row->>'stableRowFingerprint', '');
    if v_row_number is null or v_row_number < 1 then raise exception 'invalid source row number'; end if;
    if v_fingerprint is null or v_fingerprint !~ '^[a-f0-9]{64}$' then
      raise exception 'invalid stable row fingerprint for row %', v_row_number using errcode = '22023';
    end if;
    v_warning_count := v_warning_count + coalesce(jsonb_array_length(v_row->'warnings'), 0);

    if nullif(v_row->>'duplicateOfRow', '') is not null then
      v_matched_rows := v_matched_rows + 1;
      v_unchanged_rows := v_unchanged_rows + 1;
      continue;
    end if;

    v_had_prior := exists (
      select 1 from public.crm_source_references prior
      where prior.workspace_id = p_workspace_id
        and prior.source_import_id = v_import.id
        and (prior.stable_row_fingerprint = v_fingerprint or (prior.stable_row_fingerprint is null and prior.source_row_number = v_row_number))
    );
    v_row_created := false;
    v_row_changed := false;
    v_row_matched := false;

    v_company_name := btrim(v_row->'company'->>'name');
    if coalesce(v_company_name, '') = '' then raise exception 'company name is required for row %', v_row_number; end if;
    select prior.company_id into v_company_id
    from public.crm_source_references prior
    left join public.crm_source_revisions revision on revision.id = prior.source_revision_id and revision.workspace_id = prior.workspace_id
    where prior.workspace_id = p_workspace_id and prior.source_import_id = v_import.id and prior.company_id is not null
      and (prior.stable_row_fingerprint = v_fingerprint or (prior.stable_row_fingerprint is null and prior.source_row_number = v_row_number))
    order by coalesce(revision.revision_number, 0) desc, prior.created_at desc limit 1;
    if v_company_id is null then
      select id into v_company_id from public.crm_companies
      where workspace_id = p_workspace_id and lower(btrim(name)) = lower(v_company_name)
      order by id limit 1;
    end if;
    if v_company_id is null then
      insert into public.crm_companies (
        workspace_id, name, industry, website, domain, phone, address_line_1,
        customer_status, field_sources, created_by, updated_by
      ) values (
        p_workspace_id, v_company_name, nullif(v_row->'company'->>'industry', ''),
        nullif(v_row->'company'->>'website', ''), nullif(v_row->'company'->>'domain', ''),
        nullif(v_row->'company'->>'phone', ''), nullif(v_row->'company'->>'address_line_1', ''),
        nullif(v_row->'company'->>'customer_status', ''), coalesce(v_row->'company'->'field_sources', '{}'::jsonb),
        v_user_id, v_user_id
      ) returning id into v_company_id;
      v_created_companies := v_created_companies + 1;
      v_row_created := true;
    else
      v_row_matched := true;
      select to_jsonb(company) - 'updated_at' - 'updated_by' into v_before
      from public.crm_companies company where company.workspace_id = p_workspace_id and company.id = v_company_id;
      update public.crm_companies company set
        name = case when company.field_sources->>'name' = 'user' then company.name else v_company_name end,
        industry = case when company.field_sources->>'industry' = 'user' then company.industry else coalesce(nullif(v_row->'company'->>'industry', ''), company.industry) end,
        website = case when company.field_sources->>'website' = 'user' then company.website else coalesce(nullif(v_row->'company'->>'website', ''), company.website) end,
        domain = case when company.field_sources->>'domain' = 'user' then company.domain else coalesce(nullif(v_row->'company'->>'domain', ''), company.domain) end,
        phone = case when company.field_sources->>'phone' = 'user' then company.phone else coalesce(nullif(v_row->'company'->>'phone', ''), company.phone) end,
        address_line_1 = case when company.field_sources->>'address_line_1' = 'user' then company.address_line_1 else coalesce(nullif(v_row->'company'->>'address_line_1', ''), company.address_line_1) end,
        customer_status = case when company.field_sources->>'customer_status' = 'user' then company.customer_status else coalesce(nullif(v_row->'company'->>'customer_status', ''), company.customer_status) end,
        field_sources = company.field_sources || coalesce(v_row->'company'->'field_sources', '{}'::jsonb),
        updated_by = v_user_id
      where company.workspace_id = p_workspace_id and company.id = v_company_id;
      select to_jsonb(company) - 'updated_at' - 'updated_by' into v_after
      from public.crm_companies company where company.workspace_id = p_workspace_id and company.id = v_company_id;
      v_row_changed := v_row_changed or v_before is distinct from v_after;
    end if;
    insert into public.crm_source_references (
      workspace_id, source_import_id, source_revision_id, source_row_number,
      stable_row_fingerprint, company_id, created_by
    ) values (
      p_workspace_id, v_import.id, v_revision_id, v_row_number, v_fingerprint, v_company_id, v_user_id
    ) on conflict do nothing;

    v_contact_id := null;
    v_duplicate_contact_id := null;
    if v_row->'contact' is not null and jsonb_typeof(v_row->'contact') = 'object' then
      v_email := lower(nullif(btrim(v_row->'contact'->>'email'), ''));
      v_full_name := nullif(btrim(v_row->'contact'->>'full_name'), '');
      v_phone := nullif(btrim(v_row->'contact'->>'phone'), '');
      select prior.contact_id into v_contact_id
      from public.crm_source_references prior
      left join public.crm_source_revisions revision on revision.id = prior.source_revision_id and revision.workspace_id = prior.workspace_id
      where prior.workspace_id = p_workspace_id and prior.source_import_id = v_import.id and prior.contact_id is not null
        and (prior.stable_row_fingerprint = v_fingerprint or (prior.stable_row_fingerprint is null and prior.source_row_number = v_row_number))
      order by coalesce(revision.revision_number, 0) desc, prior.created_at desc limit 1;
      if v_contact_id is null and v_email is not null then
        select id into v_contact_id from public.crm_contacts
        where workspace_id = p_workspace_id and lower(email) = v_email order by created_at desc, id limit 1;
      end if;
      if v_contact_id is null and v_full_name is not null and regexp_replace(coalesce(v_phone, ''), '\D', '', 'g') <> '' then
        select id into v_duplicate_contact_id from public.crm_contacts
        where workspace_id = p_workspace_id
          and lower(regexp_replace(btrim(coalesce(full_name, '')), '[^[:alnum:]]+', '', 'g')) = lower(regexp_replace(btrim(v_full_name), '[^[:alnum:]]+', '', 'g'))
          and regexp_replace(coalesce(phone, ''), '\D', '', 'g') = regexp_replace(v_phone, '\D', '', 'g')
        order by created_at asc, id limit 1;
      end if;
      if v_contact_id is null then
        insert into public.crm_contacts (
          workspace_id, company_id, first_name, last_name, full_name, email, phone, job_title,
          record_state, created_by, updated_by
        ) values (
          p_workspace_id, v_company_id, nullif(v_row->'contact'->>'first_name', ''),
          nullif(v_row->'contact'->>'last_name', ''), v_full_name, v_email, v_phone,
          nullif(v_row->'contact'->>'job_title', ''),
          case when v_row->'contact'->>'record_state' = 'outdated' then 'outdated' else 'unverified' end,
          v_user_id, v_user_id
        ) returning id into v_contact_id;
        v_created_contacts := v_created_contacts + 1;
        v_row_created := true;
        if v_duplicate_contact_id is not null then
          update public.crm_contacts
          set record_state = case when record_state = 'verified' then record_state else 'outdated' end,
              duplicate_review_of = v_contact_id,
              updated_by = v_user_id
          where workspace_id = p_workspace_id and id = v_duplicate_contact_id;
          v_duplicate_review_rows := v_duplicate_review_rows + 1;
        end if;
      else
        v_row_matched := true;
        select to_jsonb(contact) - 'updated_at' - 'updated_by' into v_before
        from public.crm_contacts contact where contact.workspace_id = p_workspace_id and contact.id = v_contact_id;
        update public.crm_contacts contact set
          company_id = v_company_id,
          first_name = coalesce(nullif(v_row->'contact'->>'first_name', ''), contact.first_name),
          last_name = coalesce(nullif(v_row->'contact'->>'last_name', ''), contact.last_name),
          full_name = coalesce(v_full_name, contact.full_name),
          email = coalesce(v_email, contact.email),
          phone = coalesce(v_phone, contact.phone),
          job_title = coalesce(nullif(v_row->'contact'->>'job_title', ''), contact.job_title),
          record_state = case
            when contact.record_state = 'verified' then contact.record_state
            when v_row->'contact'->>'record_state' = 'outdated' then 'outdated'
            else contact.record_state
          end,
          updated_by = v_user_id
        where contact.workspace_id = p_workspace_id and contact.id = v_contact_id;
        select to_jsonb(contact) - 'updated_at' - 'updated_by' into v_after
        from public.crm_contacts contact where contact.workspace_id = p_workspace_id and contact.id = v_contact_id;
        v_row_changed := v_row_changed or v_before is distinct from v_after;
      end if;
      insert into public.crm_source_references (
        workspace_id, source_import_id, source_revision_id, source_row_number,
        stable_row_fingerprint, contact_id, created_by
      ) values (
        p_workspace_id, v_import.id, v_revision_id, v_row_number, v_fingerprint, v_contact_id, v_user_id
      ) on conflict do nothing;
    end if;

    v_deal_id := null;
    if v_row->'deal' is not null and jsonb_typeof(v_row->'deal') = 'object' then
      select prior.deal_id into v_deal_id
      from public.crm_source_references prior
      left join public.crm_source_revisions revision on revision.id = prior.source_revision_id and revision.workspace_id = prior.workspace_id
      where prior.workspace_id = p_workspace_id and prior.source_import_id = v_import.id and prior.deal_id is not null
        and (prior.stable_row_fingerprint = v_fingerprint or (prior.stable_row_fingerprint is null and prior.source_row_number = v_row_number))
      order by coalesce(revision.revision_number, 0) desc, prior.created_at desc limit 1;
      if v_deal_id is null then
        select id into v_deal_id from public.crm_deals
        where workspace_id = p_workspace_id and company_id = v_company_id
          and lower(btrim(name)) = lower(btrim(v_row->'deal'->>'name'))
        order by created_at desc, id limit 1;
      end if;
      if v_deal_id is null then
        insert into public.crm_deals (
          workspace_id, company_id, name, stage, amount, currency, status,
          last_call_at, follow_up_at, call_outcome, appointment_status, created_by, updated_by
        ) values (
          p_workspace_id, v_company_id, btrim(v_row->'deal'->>'name'),
          coalesce(nullif(btrim(v_row->'deal'->>'stage'), ''), 'New'),
          nullif(v_row->'deal'->>'amount', '')::numeric,
          coalesce(nullif(upper(btrim(v_row->'deal'->>'currency')), ''), 'SGD'), 'open',
          nullif(v_row->'deal'->>'last_call_at', '')::timestamptz,
          nullif(v_row->'deal'->>'follow_up_at', '')::timestamptz,
          nullif(v_row->'deal'->>'call_outcome', ''), nullif(v_row->'deal'->>'appointment_status', ''),
          v_user_id, v_user_id
        ) returning id into v_deal_id;
        v_created_deals := v_created_deals + 1;
        v_row_created := true;
      else
        v_row_matched := true;
        select to_jsonb(deal) - 'updated_at' - 'updated_by' into v_before
        from public.crm_deals deal where deal.workspace_id = p_workspace_id and deal.id = v_deal_id;
        update public.crm_deals deal set
          company_id = v_company_id,
          name = btrim(v_row->'deal'->>'name'),
          stage = coalesce(nullif(btrim(v_row->'deal'->>'stage'), ''), deal.stage),
          amount = coalesce(nullif(v_row->'deal'->>'amount', '')::numeric, deal.amount),
          currency = coalesce(nullif(upper(btrim(v_row->'deal'->>'currency')), ''), deal.currency),
          last_call_at = coalesce(nullif(v_row->'deal'->>'last_call_at', '')::timestamptz, deal.last_call_at),
          follow_up_at = coalesce(nullif(v_row->'deal'->>'follow_up_at', '')::timestamptz, deal.follow_up_at),
          call_outcome = coalesce(nullif(v_row->'deal'->>'call_outcome', ''), deal.call_outcome),
          appointment_status = coalesce(nullif(v_row->'deal'->>'appointment_status', ''), deal.appointment_status),
          updated_by = v_user_id
        where deal.workspace_id = p_workspace_id and deal.id = v_deal_id;
        select to_jsonb(deal) - 'updated_at' - 'updated_by' into v_after
        from public.crm_deals deal where deal.workspace_id = p_workspace_id and deal.id = v_deal_id;
        v_row_changed := v_row_changed or v_before is distinct from v_after;
      end if;
      insert into public.crm_source_references (
        workspace_id, source_import_id, source_revision_id, source_row_number,
        stable_row_fingerprint, deal_id, created_by
      ) values (
        p_workspace_id, v_import.id, v_revision_id, v_row_number, v_fingerprint, v_deal_id, v_user_id
      ) on conflict do nothing;
      if v_contact_id is not null then
        insert into public.crm_deal_contacts (workspace_id, deal_id, contact_id, created_by)
        values (p_workspace_id, v_deal_id, v_contact_id, v_user_id) on conflict do nothing;
      end if;
    end if;

    if v_row->'activities' is not null then
      if jsonb_typeof(v_row->'activities') <> 'array' or jsonb_array_length(v_row->'activities') > 10 then
        raise exception 'invalid activities for source row %', v_row_number using errcode = '22023';
      end if;
      for v_activity in select value from jsonb_array_elements(v_row->'activities')
      loop
        if v_activity->>'kind' not in ('note', 'call') then
          raise exception 'invalid activity kind for source row %', v_row_number using errcode = '22023';
        end if;
        if nullif(btrim(v_activity->>'source_column'), '') is null then
          raise exception 'activity source column is required for source row %', v_row_number using errcode = '22023';
        end if;
        v_activity_id := null;
        v_activity_changed := false;
        select activity.id,
          activity.body is distinct from btrim(v_activity->>'body')
          or activity.occurred_at is distinct from coalesce(nullif(v_activity->>'occurred_at', '')::timestamptz, activity.occurred_at)
          or activity.call_outcome is distinct from nullif(v_activity->>'call_outcome', '')
        into v_activity_id, v_activity_changed
        from public.crm_activities activity
        where activity.workspace_id = p_workspace_id and activity.source_import_id = v_import.id
          and activity.source_column = nullif(btrim(v_activity->>'source_column'), '')
          and (
            activity.stable_row_fingerprint = v_fingerprint
            or (activity.stable_row_fingerprint is null and activity.source_row_number = v_row_number)
            or (
              activity.stable_row_fingerprint is null
              and activity.company_id is not distinct from v_company_id
              and activity.contact_id is not distinct from v_contact_id
              and activity.deal_id is not distinct from v_deal_id
            )
          )
        order by activity.created_at desc limit 1;
        if v_activity_id is null then
          insert into public.crm_activities (
            workspace_id, company_id, contact_id, deal_id, kind, body, occurred_at, call_outcome,
            source_import_id, source_revision_id, source_row_number, stable_row_fingerprint,
            source_column, created_by, updated_by
          ) values (
            p_workspace_id, v_company_id, v_contact_id, v_deal_id,
            v_activity->>'kind', btrim(v_activity->>'body'),
            coalesce(nullif(v_activity->>'occurred_at', '')::timestamptz, now()),
            nullif(v_activity->>'call_outcome', ''), v_import.id, v_revision_id,
            v_row_number, v_fingerprint, nullif(btrim(v_activity->>'source_column'), ''),
            v_user_id, v_user_id
          );
          v_created_activities := v_created_activities + 1;
          v_row_created := true;
        else
          update public.crm_activities
          set company_id = v_company_id, contact_id = v_contact_id, deal_id = v_deal_id,
              kind = v_activity->>'kind', body = btrim(v_activity->>'body'),
              occurred_at = coalesce(nullif(v_activity->>'occurred_at', '')::timestamptz, occurred_at),
              call_outcome = nullif(v_activity->>'call_outcome', ''),
              source_revision_id = v_revision_id, source_row_number = v_row_number,
              stable_row_fingerprint = v_fingerprint, updated_by = v_user_id
          where workspace_id = p_workspace_id and id = v_activity_id;
          v_row_changed := v_row_changed or v_activity_changed;
        end if;
      end loop;
    end if;

    if v_row_created then
      v_created_rows := v_created_rows + 1;
    elsif v_row_changed then
      v_updated_rows := v_updated_rows + 1;
    else
      v_unchanged_rows := v_unchanged_rows + 1;
    end if;
    if v_had_prior or v_row_matched then v_matched_rows := v_matched_rows + 1; end if;
  end loop;

  return jsonb_build_object(
    'source_import_id', v_import.id, 'source_revision_id', v_revision_id,
    'revision_number', v_revision_number, 'database_id', v_import.database_id,
    'row_count', v_import.row_count, 'created_companies', v_created_companies,
    'created_contacts', v_created_contacts, 'created_deals', v_created_deals,
    'created_activities', v_created_activities, 'created_rows', v_created_rows,
    'updated_rows', v_updated_rows, 'unchanged_rows', v_unchanged_rows,
    'duplicate_review_rows', v_duplicate_review_rows, 'matched_rows', v_matched_rows,
    'warning_count', v_warning_count
  );
end;
$$;

revoke all on function public.crm_commit_import_with_activities(uuid, text, text, text, integer, text, jsonb) from public, anon;
grant execute on function public.crm_commit_import_with_activities(uuid, text, text, text, integer, text, jsonb) to authenticated;

drop function if exists public.crm_list_contacts(uuid, uuid, text, uuid, text, integer, integer);

create or replace function public.crm_list_contacts(
  p_workspace_id uuid,
  p_source_import_id uuid default null,
  p_search text default '',
  p_company_id uuid default null,
  p_record_state text default null,
  p_visibility text default 'visible',
  p_duplicate_review boolean default null,
  p_sort text default 'name_asc',
  p_offset integer default 0,
  p_limit integer default 25
)
returns table (row_data jsonb, total_count bigint)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not exists (select 1 from public.workspace_members wm where wm.workspace_id = p_workspace_id and wm.user_id = auth.uid()) then
    raise exception 'workspace membership required' using errcode = '42501';
  end if;
  if p_offset < 0 or p_limit not between 1 and 100 then raise exception 'invalid page range' using errcode = '22023'; end if;
  if p_record_state is not null and p_record_state not in ('unverified', 'verified', 'outdated') then
    raise exception 'invalid contact state' using errcode = '22023';
  end if;
  if p_visibility not in ('visible', 'hidden', 'all') then
    raise exception 'invalid contact visibility' using errcode = '22023';
  end if;

  return query
  with filtered as (
    select c.*
    from public.crm_contacts c
    left join public.crm_companies company
      on company.workspace_id = c.workspace_id and company.id = c.company_id
    where c.workspace_id = p_workspace_id
      and (
        coalesce(btrim(p_search), '') = ''
        or position(lower(btrim(p_search)) in lower(concat_ws(' ', c.job_title, company.name, c.phone, c.email, c.full_name))) > 0
      )
      and (p_company_id is null or c.company_id = p_company_id)
      and (p_record_state is null or c.record_state = p_record_state)
      and (
        p_visibility = 'all'
        or (p_visibility = 'hidden' and c.is_hidden)
        or (p_visibility = 'visible' and not c.is_hidden)
      )
      and (
        p_duplicate_review is null
        or (p_duplicate_review = true and c.duplicate_review_of is not null)
        or (p_duplicate_review = false and c.duplicate_review_of is null)
      )
      and (p_source_import_id is null or exists (
        select 1 from public.crm_source_references rf
        where rf.workspace_id = p_workspace_id and rf.source_import_id = p_source_import_id and rf.contact_id = c.id
      ))
  ), paged as (
    select f.*, count(*) over () as full_count
    from filtered f
    order by
      case when p_sort = 'name_desc' then lower(coalesce(f.full_name, f.email, '')) end desc,
      case when p_sort = 'recent' then f.created_at end desc,
      case when p_sort not in ('name_desc', 'recent') then lower(coalesce(f.full_name, f.email, '')) end asc,
      f.id asc
    offset p_offset limit p_limit
  )
  select to_jsonb(p) - 'full_count' || jsonb_build_object(
      'company', case when company.id is null then null else jsonb_build_object('id', company.id, 'name', company.name, 'industry', company.industry) end,
      'primary_source', src.primary_source,
      'source_count', coalesce(src.source_count, 0),
      'source_row_number', src.source_row_number,
      'deal_count', (select count(*) from public.crm_deal_contacts dc where dc.workspace_id = p_workspace_id and dc.contact_id = p.id),
      'task_count', (select count(*) from public.crm_tasks ct where ct.workspace_id = p_workspace_id and ct.contact_id = p.id)
    ), p.full_count
  from paged p
  left join public.crm_companies company on company.workspace_id = p.workspace_id and company.id = p.company_id
  left join lateral (
    select count(distinct r.source_import_id)::integer as source_count,
      min(r.source_row_number) filter (where r.source_import_id = p_source_import_id) as source_row_number,
      (select jsonb_build_object(
          'id', si.id, 'database_id', si.database_id, 'filename', si.original_filename,
          'source_type', coalesce(si.source_metadata->>'source_type', 'workbook'),
          'headers', coalesce(si.source_metadata->'headers', '[]'::jsonb),
          'row_index_available', si.source_metadata ? 'row_index_r2_key'
        )
       from public.crm_source_references rr join public.crm_source_imports si
         on si.workspace_id = rr.workspace_id and si.id = rr.source_import_id
       where rr.workspace_id = p_workspace_id and rr.contact_id = p.id
       order by (rr.source_import_id = p_source_import_id) desc, rr.created_at desc, rr.id desc limit 1) as primary_source
    from public.crm_source_references r where r.workspace_id = p_workspace_id and r.contact_id = p.id
  ) src on true;
end;
$$;

revoke all on function public.crm_list_contacts(uuid, uuid, text, uuid, text, text, boolean, text, integer, integer) from public, anon;
grant execute on function public.crm_list_contacts(uuid, uuid, text, uuid, text, text, boolean, text, integer, integer) to authenticated;

create or replace function public.crm_hide_outdated_contacts(
  p_workspace_id uuid,
  p_contact_ids uuid[] default null,
  p_search text default '',
  p_company_id uuid default null,
  p_source_import_id uuid default null,
  p_duplicate_review boolean default null
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_affected integer := 0;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not exists (select 1 from public.workspace_members wm where wm.workspace_id = p_workspace_id and wm.user_id = auth.uid()) then
    raise exception 'workspace membership required' using errcode = '42501';
  end if;

  update public.crm_contacts c
  set is_hidden = true, updated_by = auth.uid()
  where c.workspace_id = p_workspace_id
    and c.record_state = 'outdated'
    and not c.is_hidden
    and (p_contact_ids is null or c.id = any(p_contact_ids))
    and (p_company_id is null or c.company_id = p_company_id)
    and (
      coalesce(btrim(p_search), '') = ''
      or position(lower(btrim(p_search)) in lower(concat_ws(
        ' ', c.job_title,
        (select company.name from public.crm_companies company where company.workspace_id = c.workspace_id and company.id = c.company_id),
        c.phone, c.email, c.full_name
      ))) > 0
    )
    and (
      p_duplicate_review is null
      or (p_duplicate_review = true and c.duplicate_review_of is not null)
      or (p_duplicate_review = false and c.duplicate_review_of is null)
    )
    and (p_source_import_id is null or exists (
      select 1 from public.crm_source_references rf
      where rf.workspace_id = p_workspace_id and rf.source_import_id = p_source_import_id and rf.contact_id = c.id
    ));
  get diagnostics v_affected = row_count;
  return v_affected;
end;
$$;

revoke all on function public.crm_hide_outdated_contacts(uuid, uuid[], text, uuid, uuid, boolean) from public, anon;
grant execute on function public.crm_hide_outdated_contacts(uuid, uuid[], text, uuid, uuid, boolean) to authenticated;

drop function if exists public.crm_list_companies(uuid, uuid, text, text, text, integer, integer);

create or replace function public.crm_list_companies(
  p_workspace_id uuid,
  p_source_import_id uuid default null,
  p_search text default '',
  p_industry text default null,
  p_customer_status text default null,
  p_sort text default 'name_asc',
  p_offset integer default 0,
  p_limit integer default 25
)
returns table (row_data jsonb, total_count bigint)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not exists (select 1 from public.workspace_members wm where wm.workspace_id = p_workspace_id and wm.user_id = auth.uid()) then
    raise exception 'workspace membership required' using errcode = '42501';
  end if;
  if p_offset < 0 or p_limit not between 1 and 100 then raise exception 'invalid page range' using errcode = '22023'; end if;

  return query
  with filtered as (
    select c.*
    from public.crm_companies c
    where c.workspace_id = p_workspace_id
      and (coalesce(btrim(p_search), '') = '' or position(lower(btrim(p_search)) in lower(c.name)) > 0)
      and (nullif(btrim(p_industry), '') is null or c.industry = btrim(p_industry))
      and (nullif(btrim(p_customer_status), '') is null or c.customer_status = btrim(p_customer_status))
      and (p_source_import_id is null or exists (
        select 1 from public.crm_source_references rf
        where rf.workspace_id = p_workspace_id and rf.source_import_id = p_source_import_id and rf.company_id = c.id
      ))
  ), paged as (
    select f.*, count(*) over () as full_count
    from filtered f
    order by
      case when p_sort = 'name_desc' then lower(f.name) end desc,
      case when p_sort = 'recent' then f.created_at end desc,
      case when p_sort not in ('name_desc', 'recent') then lower(f.name) end asc,
      f.id asc
    offset p_offset limit p_limit
  )
  select to_jsonb(p) - 'full_count' || jsonb_build_object(
      'primary_source', src.primary_source,
      'source_count', coalesce(src.source_count, 0),
      'source_row_number', src.source_row_number,
      'contact_count', (select count(*) from public.crm_contacts cc where cc.workspace_id = p_workspace_id and cc.company_id = p.id),
      'deal_count', (select count(*) from public.crm_deals cd where cd.workspace_id = p_workspace_id and cd.company_id = p.id),
      'task_count', (select count(*) from public.crm_tasks ct where ct.workspace_id = p_workspace_id and ct.company_id = p.id),
      'last_contact_at', activity_summary.last_contact_at,
      'follow_up_at', follow_up.follow_up_at,
      'last_call_outcome', activity_summary.last_call_outcome,
      'latest_activity_at', activity_summary.latest_activity_at,
      'latest_activity_preview', activity_summary.latest_activity_preview
    ), p.full_count
  from paged p
  left join lateral (
    select
      (select max(contact_activity.occurred_at)
       from public.crm_activities contact_activity
       where contact_activity.workspace_id = p_workspace_id
         and contact_activity.company_id = p.id
         and contact_activity.kind in ('call', 'note')) as last_contact_at,
      (select latest_call.call_outcome
       from public.crm_activities latest_call
       where latest_call.workspace_id = p_workspace_id
         and latest_call.company_id = p.id
         and latest_call.kind = 'call'
         and latest_call.call_outcome is not null
       order by latest_call.occurred_at desc, latest_call.id desc limit 1) as last_call_outcome,
      (select latest_activity.occurred_at
       from public.crm_activities latest_activity
       where latest_activity.workspace_id = p_workspace_id and latest_activity.company_id = p.id
       order by latest_activity.occurred_at desc, latest_activity.id desc limit 1) as latest_activity_at,
      (select left(latest_activity.body, 240)
       from public.crm_activities latest_activity
       where latest_activity.workspace_id = p_workspace_id and latest_activity.company_id = p.id
       order by latest_activity.occurred_at desc, latest_activity.id desc limit 1) as latest_activity_preview
  ) activity_summary on true
  left join lateral (
    select coalesce(
      (select min(open_task.due_at)
       from public.crm_tasks open_task
       where open_task.workspace_id = p_workspace_id
         and open_task.company_id = p.id
         and open_task.status in ('open', 'in_progress')
         and open_task.due_at is not null),
      (select min(open_deal.follow_up_at)
       from public.crm_deals open_deal
       where open_deal.workspace_id = p_workspace_id
         and open_deal.company_id = p.id
         and open_deal.status in ('open', 'on_hold')
         and open_deal.follow_up_at is not null)
    ) as follow_up_at
  ) follow_up on true
  left join lateral (
    select count(distinct r.source_import_id)::integer as source_count,
      min(r.source_row_number) filter (where r.source_import_id = p_source_import_id) as source_row_number,
      (select jsonb_build_object(
          'id', si.id, 'database_id', si.database_id, 'filename', si.original_filename,
          'source_type', coalesce(si.source_metadata->>'source_type', 'workbook'),
          'headers', coalesce(si.source_metadata->'headers', '[]'::jsonb),
          'row_index_available', si.source_metadata ? 'row_index_r2_key'
        )
       from public.crm_source_references rr join public.crm_source_imports si
         on si.workspace_id = rr.workspace_id and si.id = rr.source_import_id
       where rr.workspace_id = p_workspace_id and rr.company_id = p.id
       order by (rr.source_import_id = p_source_import_id) desc, rr.created_at desc, rr.id desc limit 1) as primary_source
    from public.crm_source_references r where r.workspace_id = p_workspace_id and r.company_id = p.id
  ) src on true;
end;
$$;

revoke all on function public.crm_list_companies(uuid, uuid, text, text, text, text, integer, integer) from public, anon;
grant execute on function public.crm_list_companies(uuid, uuid, text, text, text, text, integer, integer) to authenticated;
