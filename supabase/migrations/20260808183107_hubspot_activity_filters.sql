-- Dashboard activity means the source CRM activity time only. It must never
-- silently fall back to the time a row happened to be imported into QuotePulse.
update public.companies c
set last_deal_at = activity.last_deal_at
from (
  select d.owner_id, d.company_id,
    max(coalesce(d.hubspot_modified_at, d.hubspot_created_at)) as last_deal_at
  from public.deals d
  where d.company_id is not null
  group by d.owner_id, d.company_id
) activity
where c.id = activity.company_id and c.owner_id = activity.owner_id;

update public.companies c
set last_deal_at = null
where not exists (
  select 1 from public.deals d
  where d.owner_id = c.owner_id
    and d.company_id = c.id
    and coalesce(d.hubspot_modified_at, d.hubspot_created_at) is not null
);

create or replace function public.sync_company_last_deal_at()
returns trigger language plpgsql set search_path = public, extensions as $$
declare
  affected_company uuid;
  affected_owner uuid;
begin
  if tg_op = 'DELETE' then
    affected_company := old.company_id;
    affected_owner := old.owner_id;
  else
    affected_company := new.company_id;
    affected_owner := new.owner_id;
  end if;
  if affected_company is not null then
    update public.companies c
    set last_deal_at = (
      select max(coalesce(d.hubspot_modified_at, d.hubspot_created_at))
      from public.deals d
      where d.owner_id = affected_owner and d.company_id = affected_company
    )
    where c.id = affected_company and c.owner_id = affected_owner;
  end if;
  if tg_op = 'UPDATE' and old.company_id is distinct from new.company_id and old.company_id is not null then
    update public.companies c
    set last_deal_at = (
      select max(coalesce(d.hubspot_modified_at, d.hubspot_created_at))
      from public.deals d where d.owner_id = old.owner_id and d.company_id = old.company_id
    ) where c.id = old.company_id and c.owner_id = old.owner_id;
  end if;
  return null;
end $$;

drop function if exists public.company_dashboard_page(text, text, text, boolean, boolean, integer, integer);
drop function if exists public.company_dashboard_count(text, text, text, boolean, boolean);

create function public.company_dashboard_page(
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
  products text, deal_count integer, last_deal_at timestamptz, has_quote boolean,
  has_kyc boolean, last_email_status text, last_email_sent_at timestamptz
)
language sql security invoker set search_path = public, extensions as $$
  with page as materialized (
    select c.*
    from public.companies c
    where c.owner_id = auth.uid() and c.deleted_at is null
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
    order by c.last_deal_at desc nulls last, c.updated_at desc, c.id asc
    limit greatest(1, least(p_limit, 100)) offset greatest(0, p_offset)
  )
  select p.id, p.name_clean, p.name_raw, p.industry, p.website, p.source_priority, p.created_at, p.updated_at,
    pc.full_name, pc.email, pc.phone, ds.products, ds.deal_count, p.last_deal_at,
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

create function public.company_dashboard_count(
  p_search text default null,
  p_industry text default null,
  p_source_priority text default null,
  p_has_quote boolean default null,
  p_has_kyc boolean default null,
  p_activity_from date default null,
  p_activity_to date default null
) returns bigint language sql security invoker set search_path = public, extensions as $$
  select count(*) from public.companies c
  where c.owner_id = auth.uid() and c.deleted_at is null
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

revoke all on function public.company_dashboard_page(text, text, text, boolean, boolean, date, date, integer, integer) from public, anon;
revoke all on function public.company_dashboard_count(text, text, text, boolean, boolean, date, date) from public, anon;
grant execute on function public.company_dashboard_page(text, text, text, boolean, boolean, date, date, integer, integer) to authenticated;
grant execute on function public.company_dashboard_count(text, text, text, boolean, boolean, date, date) to authenticated;
