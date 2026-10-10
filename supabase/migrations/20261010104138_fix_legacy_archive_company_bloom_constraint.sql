alter table public.workspace_archive_objects
  drop constraint workspace_archive_objects_company_bloom_check;

alter table public.workspace_archive_objects
  add constraint workspace_archive_objects_company_bloom_check
  check (
    company_bloom is null
    or (
      length(company_bloom) = 1415
      and left(company_bloom, 3) = 'v1:'
      and substring(company_bloom from 4 for 1366) ~ '^[A-Za-z0-9+/]+$'
      and substring(company_bloom from 1370 for 3) = '==.'
      and substring(company_bloom from 1373 for 43) ~ '^[A-Za-z0-9_-]+$'
    )
  );

comment on constraint workspace_archive_objects_company_bloom_check
  on public.workspace_archive_objects is
  'Validates the fixed-width signed v1 company Bloom format without unsupported large regex repetitions.';
