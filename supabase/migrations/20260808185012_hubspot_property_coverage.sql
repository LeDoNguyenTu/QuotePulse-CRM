-- A field is selectable only after at least one imported company contains a
-- meaningful value for it. The function remains owner-scoped through RLS and
-- auth.uid(), so one user's field coverage never leaks to another account.
create function public.hubspot_property_names_with_values(p_object_type text default 'companies')
returns table (property_name text)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select distinct properties.key as property_name
  from public.companies c
  cross join lateral jsonb_each_text(c.hubspot_properties) as properties(key, value)
  where p_object_type = 'companies'
    and c.owner_id = auth.uid()
    and c.deleted_at is null
    and nullif(btrim(properties.value), '') is not null
    and lower(properties.value) <> 'null'
  order by property_name;
$$;

revoke all on function public.hubspot_property_names_with_values(text) from public, anon;
grant execute on function public.hubspot_property_names_with_values(text) to authenticated;
