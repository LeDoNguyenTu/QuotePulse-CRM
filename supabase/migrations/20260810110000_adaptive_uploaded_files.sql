alter table public.user_settings add column if not exists hubspot_portal_id text;
alter table public.user_settings add column if not exists hubspot_ui_domain text;

create table if not exists public.uploaded_files (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  file_name text not null,
  mime_type text not null,
  sheet_name text not null,
  headers jsonb not null,
  mapping jsonb not null default '{}'::jsonb,
  row_count integer not null check (row_count between 1 and 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.uploaded_file_rows (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  file_id uuid not null references public.uploaded_files(id) on delete cascade,
  row_number integer not null check (row_number > 0),
  values jsonb not null,
  match_status text not null default 'unmatched' check (match_status in ('matched','unmatched','needs_review')),
  match_reason text,
  match_target_type text check (match_target_type in ('company','contact','deal')),
  match_target_id uuid,
  match_hubspot_object_id text,
  match_company_id uuid references public.companies(id) on delete set null,
  merge_result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (file_id, row_number)
);
create table if not exists public.uploaded_file_merges (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  file_id uuid not null references public.uploaded_files(id) on delete restrict,
  policy jsonb not null,
  status text not null check (status in ('running','completed','partial','failed')),
  successful_row_count integer not null default 0,
  counts jsonb not null default '{}'::jsonb,
  errors jsonb not null default '[]'::jsonb,
  confirmed_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists uploaded_files_owner_created_idx on public.uploaded_files(owner_id, created_at desc);
create index if not exists uploaded_file_rows_file_idx on public.uploaded_file_rows(file_id, row_number);
create index if not exists uploaded_file_merges_file_idx on public.uploaded_file_merges(file_id, confirmed_at desc);

alter table public.uploaded_files enable row level security;
alter table public.uploaded_file_rows enable row level security;
alter table public.uploaded_file_merges enable row level security;
create policy "uploaded_files_owner" on public.uploaded_files for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "uploaded_file_rows_owner" on public.uploaded_file_rows for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "uploaded_file_merges_owner" on public.uploaded_file_merges for select to authenticated using (owner_id = auth.uid());
grant select, insert, update, delete on public.uploaded_files, public.uploaded_file_rows to authenticated;
grant select on public.uploaded_file_merges to authenticated;

create or replace function public.prevent_merged_upload_delete() returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.uploaded_file_merges m where m.file_id = old.id and m.status in ('completed','partial') and m.successful_row_count > 0) then
    raise exception 'cannot delete an uploaded file after CRM records were merged';
  end if;
  return old;
end;
$$;
drop trigger if exists trg_uploaded_files_delete_guard on public.uploaded_files;
create trigger trg_uploaded_files_delete_guard before delete on public.uploaded_files for each row execute function public.prevent_merged_upload_delete();
