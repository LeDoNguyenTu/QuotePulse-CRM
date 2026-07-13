-- =====================================================================
-- 0003_harden_function_search_path.sql
-- Pin the trigger function's search_path (Supabase advisor:
-- function_search_path_mutable). Uses an empty search_path so the function
-- resolves nothing implicitly; it only calls now() and touches NEW, both safe.
-- =====================================================================
create or replace function set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end $$;
