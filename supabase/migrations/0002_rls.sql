-- =====================================================================
-- 0002_rls.sql — Row Level Security
--
-- Model: SHARED TEAM WORKSPACE.
--   * Any authenticated user can read/write the shared CRM tables.
--   * user_settings is PRIVATE: a user only sees/edits their own row
--     (it holds secrets: HubSpot token, Microsoft refresh token, etc).
--   * Edge Functions use the SERVICE ROLE key, which bypasses RLS entirely,
--     so ingestion/sending are unaffected by these policies.
-- =====================================================================

-- Enable RLS everywhere.
alter table industries      enable row level security;
alter table companies       enable row level security;
alter table deals           enable row level security;
alter table contacts        enable row level security;
alter table attachments     enable row level security;
alter table kyc_profiles    enable row level security;
alter table email_templates enable row level security;
alter table email_sends     enable row level security;
alter table user_settings   enable row level security;

-- ---------------------------------------------------------------------
-- Shared tables: full access for authenticated users.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'industries','companies','deals','contacts','attachments',
    'kyc_profiles','email_templates','email_sends'
  ]
  loop
    execute format('drop policy if exists "%s_auth_all" on %I;', t, t);
    execute format($f$
      create policy "%1$s_auth_all" on %1$I
        for all
        to authenticated
        using (true)
        with check (true);
    $f$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- user_settings: strictly private per user.
-- ---------------------------------------------------------------------
drop policy if exists "user_settings_select_own" on user_settings;
create policy "user_settings_select_own" on user_settings
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "user_settings_insert_own" on user_settings;
create policy "user_settings_insert_own" on user_settings
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "user_settings_update_own" on user_settings;
create policy "user_settings_update_own" on user_settings
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "user_settings_delete_own" on user_settings;
create policy "user_settings_delete_own" on user_settings
  for delete to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- Dashboard view: run with the querying user's privileges (respect RLS)
-- and expose only to authenticated users.
-- ---------------------------------------------------------------------
alter view company_dashboard set (security_invoker = true);
revoke all on company_dashboard from anon;
grant select on company_dashboard to authenticated;
