-- Expand Job Intelligence from two ATS connectors to public employer feeds and
-- compliant link-only Singapore job-portal discovery.
alter table public.job_source_configs
  drop constraint if exists job_source_configs_provider_check;

alter table public.job_source_configs
  add constraint job_source_configs_provider_check check (provider in (
    'greenhouse', 'lever', 'smartrecruiters', 'ashby', 'career_page',
    'linkedin', 'mycareersfuture', 'jobstreet', 'indeed', 'foundit',
    'fastjobs', 'glints', 'careersgov', 'workday'
  ));

alter table public.job_source_configs
  drop constraint if exists job_source_configs_identifier_check;

alter table public.job_source_configs
  add constraint job_source_configs_identifier_check check (
    length(btrim(identifier)) between 1 and 2048
    and identifier !~ '[[:cntrl:]]'
  ),
  add column source_url text,
  add column market text not null default 'Singapore';

alter table public.job_source_configs
  add constraint job_source_configs_source_url_https_check check (
    source_url is null or source_url ~ '^https://'
  ),
  add constraint job_source_configs_market_check check (
    length(btrim(market)) between 1 and 100 and market !~ '[[:cntrl:]]'
  );

alter table public.job_opportunities
  add column canonical_fingerprint text default '';

update public.job_opportunities
set canonical_fingerprint =
  btrim(lower(regexp_replace(title, '[[:punct:][:space:]]+', ' ', 'g')))
  || '|'
  || case
    when coalesce(location, '') ~* '(^|[^a-z])(singapore|sg)([^a-z]|$)' then 'singapore'
    else btrim(lower(regexp_replace(coalesce(location, ''), '[[:punct:][:space:]]+', ' ', 'g')))
  end;

alter table public.job_opportunities
  alter column canonical_fingerprint set not null;

create index job_opportunities_owner_company_canonical_idx
  on public.job_opportunities (owner_id, company_id, canonical_fingerprint)
  where is_open;
