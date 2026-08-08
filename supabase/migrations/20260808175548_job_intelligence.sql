-- Per-owner MNC career-source configuration. Only public, documented ATS APIs
-- are supported; LinkedIn and MyCareersFuture are intentionally excluded.
create table public.job_source_configs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  provider text not null check (provider in ('greenhouse', 'lever')),
  identifier text not null check (identifier ~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$'),
  label text,
  enabled boolean not null default true,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, company_id, provider, identifier)
);

create index job_source_configs_owner_company_idx
  on public.job_source_configs (owner_id, company_id);

create table public.job_opportunities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  job_source_config_id uuid not null references public.job_source_configs(id) on delete cascade,
  external_id text not null,
  fingerprint text not null,
  title text not null,
  location text,
  department text,
  workplace_type text,
  description text,
  apply_url text not null,
  source_url text,
  posted_at timestamptz,
  is_open boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, job_source_config_id, external_id)
);

create index job_opportunities_owner_company_open_idx
  on public.job_opportunities (owner_id, company_id, is_open, posted_at desc nulls last);

create index job_opportunities_source_fingerprint_idx
  on public.job_opportunities (owner_id, fingerprint);

drop trigger if exists trg_job_source_configs_updated_at on public.job_source_configs;
create trigger trg_job_source_configs_updated_at
  before update on public.job_source_configs
  for each row execute function public.set_updated_at();

drop trigger if exists trg_job_opportunities_updated_at on public.job_opportunities;
create trigger trg_job_opportunities_updated_at
  before update on public.job_opportunities
  for each row execute function public.set_updated_at();

alter table public.job_source_configs enable row level security;
alter table public.job_opportunities enable row level security;

create policy "job sources belong to owner" on public.job_source_configs
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check (
    (select auth.uid()) = owner_id
    and exists (
      select 1 from public.companies c
      where c.id = company_id and c.owner_id = (select auth.uid())
    )
  );

create policy "job opportunities belong to owner" on public.job_opportunities
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check (
    (select auth.uid()) = owner_id
    and exists (
      select 1 from public.companies c
      where c.id = company_id and c.owner_id = (select auth.uid())
    )
    and exists (
      select 1 from public.job_source_configs s
      where s.id = job_source_config_id
        and s.company_id = company_id
        and s.owner_id = (select auth.uid())
    )
  );

grant select, insert, update, delete on public.job_source_configs to authenticated;
grant select, insert, update, delete on public.job_opportunities to authenticated;
