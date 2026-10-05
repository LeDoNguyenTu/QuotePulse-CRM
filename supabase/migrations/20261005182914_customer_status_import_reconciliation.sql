-- Preserve per-revision workbook evidence and surface ambiguous sheet-derived
-- customer statuses without overwriting a user's manual decision.

alter table public.crm_companies
  add column customer_status_review_required boolean not null default false,
  add column customer_status_review_reason text
    check (
      customer_status_review_reason is null
      or length(btrim(customer_status_review_reason)) between 1 and 500
    ),
  add constraint crm_companies_customer_status_review_reason_check
    check (customer_status_review_required or customer_status_review_reason is null);

create index crm_companies_workspace_status_review_idx
  on public.crm_companies (workspace_id, customer_status_review_required, id)
  where customer_status_review_required;

alter table public.crm_source_revisions
  add constraint crm_source_revisions_workspace_import_id_key
    unique (workspace_id, source_import_id, id);

create table public.crm_source_revision_artifacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source_import_id uuid not null,
  source_revision_id uuid not null,
  template_r2_key text not null check (length(template_r2_key) between 1 and 2000),
  template_r2_sha256 text not null check (template_r2_sha256 ~ '^[a-f0-9]{64}$'),
  row_index_r2_key text check (row_index_r2_key is null or length(row_index_r2_key) between 1 and 2000),
  row_index_r2_sha256 text check (row_index_r2_sha256 is null or row_index_r2_sha256 ~ '^[a-f0-9]{64}$'),
  headers jsonb not null default '[]'::jsonb check (jsonb_typeof(headers) = 'array'),
  mapping jsonb not null default '{}'::jsonb check (jsonb_typeof(mapping) = 'object'),
  finalization_status text not null default 'pending' check (finalization_status in ('pending', 'ready')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  finalized_at timestamptz,
  check (
    (finalization_status = 'pending' and row_index_r2_key is null and row_index_r2_sha256 is null and finalized_at is null)
    or (finalization_status = 'ready' and row_index_r2_key is not null and row_index_r2_sha256 is not null and finalized_at is not null)
  ),
  unique (workspace_id, source_revision_id),
  foreign key (workspace_id, source_import_id, source_revision_id)
    references public.crm_source_revisions (workspace_id, source_import_id, id) on delete cascade
);

create index crm_source_revision_artifacts_import_idx
  on public.crm_source_revision_artifacts (workspace_id, source_import_id, created_at desc);

alter table public.crm_source_revision_artifacts enable row level security;
revoke all on table public.crm_source_revision_artifacts from anon, authenticated;
grant select on table public.crm_source_revision_artifacts to authenticated;
grant all on table public.crm_source_revision_artifacts to service_role;

create policy crm_source_revision_artifacts_select_member
on public.crm_source_revision_artifacts for select to authenticated
using (
  exists (
    select 1 from public.workspace_members member
    where member.workspace_id = crm_source_revision_artifacts.workspace_id
      and member.user_id = (select auth.uid())
  )
);

create function public.crm_guard_source_revision_artifact_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.finalization_status <> 'pending' or new.finalization_status <> 'ready'
    or old.id is distinct from new.id
    or old.workspace_id is distinct from new.workspace_id
    or old.source_import_id is distinct from new.source_import_id
    or old.source_revision_id is distinct from new.source_revision_id
    or old.template_r2_key is distinct from new.template_r2_key
    or old.template_r2_sha256 is distinct from new.template_r2_sha256
    or old.headers is distinct from new.headers
    or old.mapping is distinct from new.mapping
    or old.created_by is distinct from new.created_by
    or old.created_at is distinct from new.created_at
  then
    raise exception 'revision artifacts are immutable after their pending row-index finalization';
  end if;
  return new;
end;
$$;

create trigger crm_source_revision_artifacts_guard_update
before update on public.crm_source_revision_artifacts
for each row execute function public.crm_guard_source_revision_artifact_update();

revoke all on function public.crm_guard_source_revision_artifact_update() from public, anon, authenticated;

create function public.crm_clear_company_status_review()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if pg_catalog.current_setting('app.crm_write_source', true) is distinct from 'workbook' then
    new.customer_status_review_required := false;
    new.customer_status_review_reason := null;
  end if;
  return new;
end;
$$;

create trigger crm_companies_clear_status_review
before update of customer_status on public.crm_companies
for each row
when (old.customer_status is distinct from new.customer_status)
execute function public.crm_clear_company_status_review();

revoke all on function public.crm_clear_company_status_review() from public, anon, authenticated;

create function public.crm_commit_import_with_customer_status_review(
  p_workspace_id uuid,
  p_original_filename text,
  p_sheet_name text,
  p_checksum_sha256 text,
  p_source_row_count integer,
  p_workbook_identity text,
  p_rows jsonb,
  p_template_r2_key text,
  p_template_r2_sha256 text,
  p_headers jsonb,
  p_mapping jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_result jsonb;
  v_base_rows jsonb;
  v_row jsonb;
  v_user_id uuid := auth.uid();
  v_revision_id uuid;
  v_fingerprint text;
  v_company_id uuid;
  v_required boolean;
  v_reason text;
  v_field_name text;
  v_field_source text;
  v_affected integer;
  v_status_review_rows integer := 0;
begin
  if v_user_id is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if p_template_r2_key is null
    or position(format('owners/%s/workspaces/%s/crm-imports/', v_user_id, p_workspace_id) in p_template_r2_key) <> 1
    or p_template_r2_sha256 !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(p_headers) <> 'array'
    or jsonb_typeof(p_mapping) <> 'object'
  then
    raise exception 'invalid workbook artifact metadata' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(
    jsonb_set(
      item,
      '{company,field_sources}',
      '{}'::jsonb,
      true
    )
  ), '[]'::jsonb)
  into v_base_rows
  from jsonb_array_elements(p_rows) as expanded(item);

  v_result := public.crm_commit_import_with_activities(
    p_workspace_id,
    p_original_filename,
    p_sheet_name,
    p_checksum_sha256,
    p_source_row_count,
    p_workbook_identity,
    v_base_rows
  );

  v_revision_id := (v_result->>'source_revision_id')::uuid;
  insert into public.crm_source_revision_artifacts (
    workspace_id, source_import_id, source_revision_id,
    template_r2_key, template_r2_sha256, headers, mapping, created_by
  ) values (
    p_workspace_id, (v_result->>'source_import_id')::uuid, v_revision_id,
    p_template_r2_key, p_template_r2_sha256, p_headers, p_mapping, v_user_id
  );

  perform pg_catalog.set_config('app.crm_write_source', 'workbook', true);
  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    if nullif(v_row->>'duplicateOfRow', '') is not null then
      continue;
    end if;
    v_required := coalesce((v_row->'company'->>'customer_status_review_required')::boolean, false);
    v_reason := case when v_required then nullif(btrim(v_row->'company'->>'customer_status_review_reason'), '') else null end;
    v_fingerprint := nullif(v_row->>'stableRowFingerprint', '');
    select reference.company_id into v_company_id
    from public.crm_source_references reference
    where reference.workspace_id = p_workspace_id
      and reference.source_import_id = (v_result->>'source_import_id')::uuid
      and reference.source_revision_id = v_revision_id
      and reference.stable_row_fingerprint = v_fingerprint
      and reference.company_id is not null
    order by reference.created_at desc
    limit 1;
    if v_company_id is null then
      continue;
    end if;

    update public.crm_companies company
    set customer_status_review_required = v_required,
        customer_status_review_reason = v_reason
    where company.workspace_id = p_workspace_id
      and company.id = v_company_id
      and coalesce(company.field_sources->>'customer_status', '') <> 'user';
    get diagnostics v_affected = row_count;
    if v_required and v_affected > 0 then
      v_status_review_rows := v_status_review_rows + 1;
    end if;

    foreach v_field_name in array array[
      'name', 'industry', 'website', 'domain', 'phone', 'address_line_1',
      'address_line_2', 'city', 'state_region', 'postal_code', 'country', 'customer_status'
    ] loop
      v_field_source := nullif(v_row->'company'->'field_sources'->>v_field_name, '');
      if v_field_source is not null then
        update public.crm_companies company
        set field_sources = jsonb_set(company.field_sources, array[v_field_name], to_jsonb(v_field_source), true)
        where company.workspace_id = p_workspace_id
          and company.id = v_company_id
          and coalesce(company.field_sources->>v_field_name, '') <> 'user';
      end if;
    end loop;
  end loop;

  return v_result || jsonb_build_object('status_review_rows', v_status_review_rows);
end;
$$;

revoke all on function public.crm_commit_import_with_customer_status_review(
  uuid, text, text, text, integer, text, jsonb, text, text, jsonb, jsonb
) from public, anon;
grant execute on function public.crm_commit_import_with_customer_status_review(
  uuid, text, text, text, integer, text, jsonb, text, text, jsonb, jsonb
) to authenticated;
