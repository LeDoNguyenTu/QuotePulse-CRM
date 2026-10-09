alter table public.workspace_archive_objects
  add column company_bloom text;

alter table public.workspace_archive_objects
  add constraint workspace_archive_objects_company_bloom_check
  check (
    company_bloom is null
    or (
      company_bloom ~ '^v1:[A-Za-z0-9+/]{1366}==\.[A-Za-z0-9_-]{43}$'
      and length(company_bloom) between 1000 and 2000
    )
  );

revoke all on table public.workspace_archive_objects from anon, authenticated;
grant select on table public.workspace_archive_objects to authenticated;
grant all on table public.workspace_archive_objects to service_role;

comment on column public.workspace_archive_objects.company_bloom is
  'Derived v1 Bloom filter of company_id values in a verified contact or deal archive object. NULL means indexing is incomplete.';
