create or replace function public.crm_commit_import(
  p_workspace_id uuid,
  p_original_filename text,
  p_sheet_name text,
  p_checksum_sha256 text,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_import public.crm_source_imports%rowtype;
  v_row jsonb;
  v_row_number integer;
  v_duplicate_row integer;
  v_company_id uuid;
  v_contact_id uuid;
  v_deal_id uuid;
  v_company_name text;
  v_email text;
  v_full_name text;
  v_created_companies integer := 0;
  v_created_contacts integer := 0;
  v_created_deals integer := 0;
  v_matched_rows integer := 0;
begin
  if v_user_id is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = p_workspace_id and wm.user_id = v_user_id
  ) then raise exception 'workspace membership required' using errcode = '42501'; end if;
  if p_original_filename is null or length(btrim(p_original_filename)) not between 1 and 500 then
    raise exception 'invalid source filename' using errcode = '22023';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) < 1 or jsonb_array_length(p_rows) > 20000 then
    raise exception 'import rows must contain between 1 and 20000 records' using errcode = '22023';
  end if;
  if p_checksum_sha256 is not null and p_checksum_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid SHA-256 checksum' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text, 0));

  insert into public.crm_source_imports (
    workspace_id, original_filename, sheet_name, row_count, checksum_sha256,
    source_metadata, imported_by, created_by
  ) values (
    p_workspace_id, btrim(p_original_filename), nullif(btrim(p_sheet_name), ''),
    jsonb_array_length(p_rows), p_checksum_sha256,
    jsonb_build_object('format', 'normalized-crm-import-v1'), v_user_id, v_user_id
  ) returning * into v_import;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_row_number := nullif(v_row->>'rowNumber', '')::integer;
    if v_row_number is null or v_row_number < 1 then raise exception 'invalid source row number'; end if;
    v_duplicate_row := nullif(v_row->>'duplicateOfRow', '')::integer;

    if v_duplicate_row is not null then
      insert into public.crm_source_references (workspace_id, source_import_id, source_row_number, company_id, contact_id, deal_id, created_by)
      select p_workspace_id, v_import.id, v_row_number, company_id, contact_id, deal_id, v_user_id
      from public.crm_source_references
      where workspace_id = p_workspace_id and source_import_id = v_import.id and source_row_number = v_duplicate_row
      on conflict do nothing;
      v_matched_rows := v_matched_rows + 1;
      continue;
    end if;

    v_company_name := btrim(v_row->'company'->>'name');
    if coalesce(v_company_name, '') = '' then raise exception 'company name is required for row %', v_row_number; end if;
    select id into v_company_id from public.crm_companies
    where workspace_id = p_workspace_id and lower(btrim(name)) = lower(v_company_name)
    order by id limit 1;
    if v_company_id is null then
      insert into public.crm_companies (
        workspace_id, name, industry, website, domain, phone, address_line_1, created_by, updated_by
      ) values (
        p_workspace_id, v_company_name, nullif(v_row->'company'->>'industry', ''),
        nullif(v_row->'company'->>'website', ''), nullif(v_row->'company'->>'domain', ''),
        nullif(v_row->'company'->>'phone', ''), nullif(v_row->'company'->>'address_line_1', ''),
        v_user_id, v_user_id
      ) returning id into v_company_id;
      v_created_companies := v_created_companies + 1;
    else v_matched_rows := v_matched_rows + 1;
    end if;
    insert into public.crm_source_references (workspace_id, source_import_id, source_row_number, company_id, created_by)
    values (p_workspace_id, v_import.id, v_row_number, v_company_id, v_user_id) on conflict do nothing;

    v_contact_id := null;
    if v_row->'contact' is not null and jsonb_typeof(v_row->'contact') = 'object' then
      v_email := lower(nullif(btrim(v_row->'contact'->>'email'), ''));
      v_full_name := nullif(btrim(v_row->'contact'->>'full_name'), '');
      if v_email is not null then
        select id into v_contact_id from public.crm_contacts
        where workspace_id = p_workspace_id and lower(email) = v_email order by id limit 1;
      elsif v_full_name is not null then
        select id into v_contact_id from public.crm_contacts
        where workspace_id = p_workspace_id and company_id = v_company_id and lower(full_name) = lower(v_full_name)
        order by id limit 1;
      end if;
      if v_contact_id is null then
        insert into public.crm_contacts (
          workspace_id, company_id, first_name, last_name, full_name, email, phone, job_title, created_by, updated_by
        ) values (
          p_workspace_id, v_company_id, nullif(v_row->'contact'->>'first_name', ''),
          nullif(v_row->'contact'->>'last_name', ''), v_full_name, v_email,
          nullif(v_row->'contact'->>'phone', ''), nullif(v_row->'contact'->>'job_title', ''),
          v_user_id, v_user_id
        ) returning id into v_contact_id;
        v_created_contacts := v_created_contacts + 1;
      end if;
      insert into public.crm_source_references (workspace_id, source_import_id, source_row_number, contact_id, created_by)
      values (p_workspace_id, v_import.id, v_row_number, v_contact_id, v_user_id) on conflict do nothing;
    end if;

    if v_row->'deal' is not null and jsonb_typeof(v_row->'deal') = 'object' then
      insert into public.crm_deals (
        workspace_id, company_id, name, stage, amount, currency, status,
        last_call_at, follow_up_at, created_by, updated_by
      ) values (
        p_workspace_id, v_company_id, btrim(v_row->'deal'->>'name'),
        coalesce(nullif(btrim(v_row->'deal'->>'stage'), ''), 'New'),
        nullif(v_row->'deal'->>'amount', '')::numeric,
        coalesce(nullif(upper(btrim(v_row->'deal'->>'currency')), ''), 'SGD'), 'open',
        nullif(v_row->'deal'->>'last_call_at', '')::timestamptz,
        nullif(v_row->'deal'->>'follow_up_at', '')::timestamptz,
        v_user_id, v_user_id
      ) returning id into v_deal_id;
      v_created_deals := v_created_deals + 1;
      insert into public.crm_source_references (workspace_id, source_import_id, source_row_number, deal_id, created_by)
      values (p_workspace_id, v_import.id, v_row_number, v_deal_id, v_user_id) on conflict do nothing;
      if v_contact_id is not null then
        insert into public.crm_deal_contacts (workspace_id, deal_id, contact_id, created_by)
        values (p_workspace_id, v_deal_id, v_contact_id, v_user_id) on conflict do nothing;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'source_import_id', v_import.id, 'database_id', v_import.database_id,
    'row_count', v_import.row_count, 'created_companies', v_created_companies,
    'created_contacts', v_created_contacts, 'created_deals', v_created_deals,
    'matched_rows', v_matched_rows
  );
end;
$$;

revoke all on function public.crm_commit_import(uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.crm_commit_import(uuid, text, text, text, jsonb) to authenticated;
