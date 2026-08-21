create table if not exists public.storage_usage_cache (
  id text primary key check (id = 'r2'),
  used_bytes bigint not null check (used_bytes >= 0),
  object_count bigint not null check (object_count >= 0),
  measured_at timestamptz not null,
  refreshed_at timestamptz not null default now(),
  source text not null check (source in ('cloudflare-analytics', 'r2-inventory'))
);

alter table public.storage_usage_cache enable row level security;
revoke all on table public.storage_usage_cache from public, anon, authenticated;
grant select, insert, update on table public.storage_usage_cache to service_role;

create or replace function public.storage_database_size_bytes()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select pg_database_size(current_database())::bigint;
$$;

revoke all on function public.storage_database_size_bytes() from public, anon, authenticated;
grant execute on function public.storage_database_size_bytes() to service_role;

comment on table public.storage_usage_cache is
  'Service-role-only cache for Cloudflare R2 usage shown on the dashboard.';
comment on function public.storage_database_size_bytes() is
  'Returns current database bytes to the service role; browser roles cannot execute it.';
