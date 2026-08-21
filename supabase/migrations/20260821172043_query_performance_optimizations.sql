-- Use the existing functional unique index for exact case-insensitive company
-- matches instead of scanning every company with a regular-expression filter.
create or replace function public.find_company_by_normalized_name(
  p_owner_id uuid,
  p_name text
)
returns table (
  id uuid,
  industry text,
  website text,
  hubspot_company_id text,
  deleted_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select company.id, company.industry, company.website,
    company.hubspot_company_id, company.deleted_at
  from public.companies company
  where company.owner_id = p_owner_id
    and lower(company.name_clean) = lower(p_name)
  limit 1;
$$;

revoke all on function public.find_company_by_normalized_name(uuid, text)
  from public, anon, authenticated;
grant execute on function public.find_company_by_normalized_name(uuid, text)
  to service_role;

-- The dashboard now sorts by the two distinct HubSpot timestamps. Replace the
-- older last_deal_at/updated_at index so LIMIT can stop after the requested page
-- instead of sorting every active company.
drop index if exists public.companies_owner_dashboard_order_idx;
create index companies_owner_dashboard_order_idx
  on public.companies (
    owner_id,
    last_hubspot_modified_at desc nulls last,
    last_hubspot_created_at desc nulls last,
    id
  )
  where deleted_at is null;

-- Cache auth.uid() once per statement in the dashboard functions. Their
-- signatures and returned columns stay unchanged.
create or replace function public.company_dashboard_page(
  p_search text default null,
  p_industry text default null,
  p_source_priority text default null,
  p_has_quote boolean default null,
  p_has_kyc boolean default null,
  p_activity_from date default null,
  p_activity_to date default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  id uuid, name_clean text, name_raw text, industry text, website text,
  source_priority source_priority, created_at timestamptz, updated_at timestamptz,
  primary_contact_name text, primary_contact_email text, primary_contact_phone text,
  products text, deal_count integer, last_deal_at timestamptz,
  last_hubspot_created_at timestamptz, last_hubspot_modified_at timestamptz,
  has_quote boolean, has_kyc boolean, last_email_status text, last_email_sent_at timestamptz
)
language sql security invoker set search_path = public, extensions as $$
  with page as materialized (
    select c.*
    from public.companies c
    where c.owner_id = (select auth.uid()) and c.deleted_at is null
      and (p_search is null or c.name_clean ilike '%' || p_search || '%' or c.name_raw ilike '%' || p_search || '%'
        or c.industry ilike '%' || p_search || '%'
        or exists (select 1 from public.contacts ct where ct.owner_id = c.owner_id and ct.company_id = c.id
          and (ct.full_name ilike '%' || p_search || '%' or ct.email ilike '%' || p_search || '%')))
      and (p_industry is null or c.industry = p_industry)
      and (p_source_priority is null or c.source_priority::text = p_source_priority)
      and (p_has_quote is not true or exists (select 1 from public.attachments a join public.deals d on d.id = a.deal_id and d.owner_id = a.owner_id
        where d.owner_id = c.owner_id and d.company_id = c.id and a.source_type = 'quote'))
      and (p_has_kyc is not true or exists (select 1 from public.kyc_profiles k where k.owner_id = c.owner_id and k.company_id = c.id))
      and (p_activity_from is null or c.last_deal_at >= p_activity_from)
      and (p_activity_to is null or c.last_deal_at < p_activity_to + 1)
    order by c.last_hubspot_modified_at desc nulls last, c.last_hubspot_created_at desc nulls last, c.id asc
    limit greatest(1, least(p_limit, 100)) offset greatest(0, p_offset)
  )
  select p.id, p.name_clean, p.name_raw, p.industry, p.website, p.source_priority, p.created_at, p.updated_at,
    pc.full_name, pc.email, pc.phone, ds.products, ds.deal_count, p.last_deal_at,
    p.last_hubspot_created_at, p.last_hubspot_modified_at,
    exists (select 1 from public.attachments a join public.deals d on d.id = a.deal_id and d.owner_id = a.owner_id
      where d.owner_id = p.owner_id and d.company_id = p.id and a.source_type = 'quote'),
    exists (select 1 from public.kyc_profiles k where k.owner_id = p.owner_id and k.company_id = p.id),
    le.status, ls.last_email_sent_at
  from page p
  left join lateral (select ct.full_name, ct.email, ct.phone from public.contacts ct
    where ct.owner_id = p.owner_id and ct.company_id = p.id
    order by ct.is_primary_contact desc, (ct.email is not null) desc, ct.created_at asc limit 1) pc on true
  left join lateral (select count(*)::int as deal_count,
    string_agg(distinct nullif(d.product, ''), ', ' order by nullif(d.product, '')) as products
    from public.deals d where d.owner_id = p.owner_id and d.company_id = p.id) ds on true
  left join lateral (select es.status from public.email_sends es where es.created_by = p.owner_id and es.company_id = p.id
    order by es.created_at desc, es.id desc limit 1) le on true
  left join lateral (select max(es.sent_at) as last_email_sent_at from public.email_sends es
    where es.created_by = p.owner_id and es.company_id = p.id and es.sent_at is not null) ls on true;
$$;

create or replace function public.company_dashboard_count(
  p_search text default null,
  p_industry text default null,
  p_source_priority text default null,
  p_has_quote boolean default null,
  p_has_kyc boolean default null,
  p_activity_from date default null,
  p_activity_to date default null
) returns bigint language sql security invoker set search_path = public, extensions as $$
  select count(*) from public.companies c
  where c.owner_id = (select auth.uid()) and c.deleted_at is null
    and (p_search is null or c.name_clean ilike '%' || p_search || '%' or c.name_raw ilike '%' || p_search || '%'
      or c.industry ilike '%' || p_search || '%'
      or exists (select 1 from public.contacts ct where ct.owner_id = c.owner_id and ct.company_id = c.id
        and (ct.full_name ilike '%' || p_search || '%' or ct.email ilike '%' || p_search || '%')))
    and (p_industry is null or c.industry = p_industry)
    and (p_source_priority is null or c.source_priority::text = p_source_priority)
    and (p_has_quote is not true or exists (select 1 from public.attachments a join public.deals d on d.id = a.deal_id and d.owner_id = a.owner_id
      where d.owner_id = c.owner_id and d.company_id = c.id and a.source_type = 'quote'))
    and (p_has_kyc is not true or exists (select 1 from public.kyc_profiles k where k.owner_id = c.owner_id and k.company_id = c.id))
    and (p_activity_from is null or c.last_deal_at >= p_activity_from)
    and (p_activity_to is null or c.last_deal_at < p_activity_to + 1);
$$;

-- Preserve each policy's operation, role and ownership rule while evaluating
-- auth.uid() through an initPlan once per statement.
alter policy attachments_owner_all on public.attachments
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
alter policy companies_owner_all on public.companies
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
alter policy contacts_owner_all on public.contacts
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
alter policy deals_owner_all on public.deals
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
alter policy email_sends_owner_all on public.email_sends
  using (created_by = (select auth.uid())) with check (created_by = (select auth.uid()));
alter policy email_suppressions_owner_all on public.email_suppressions
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
alter policy email_templates_owner_all on public.email_templates
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
alter policy email_unsubscribe_tokens_owner_read on public.email_unsubscribe_tokens
  using (owner_id = (select auth.uid()));
alter policy kyc_profiles_owner_all on public.kyc_profiles
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
alter policy sync_state_owner_all on public.sync_state
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
alter policy uploaded_file_merges_owner on public.uploaded_file_merges
  using (owner_id = (select auth.uid()));
alter policy uploaded_file_rows_owner on public.uploaded_file_rows
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
alter policy uploaded_files_owner on public.uploaded_files
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
alter policy user_settings_delete_own on public.user_settings
  using ((select auth.uid()) = user_id);
alter policy user_settings_insert_own on public.user_settings
  with check ((select auth.uid()) = user_id);
alter policy user_settings_select_own on public.user_settings
  using ((select auth.uid()) = user_id);
alter policy user_settings_update_own on public.user_settings
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
