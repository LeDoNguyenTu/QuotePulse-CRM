alter table public.user_settings
  add column if not exists session_timeout_minutes integer not null default 120;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_settings_session_timeout_minutes_check'
      and conrelid = 'public.user_settings'::regclass
  ) then
    alter table public.user_settings
      add constraint user_settings_session_timeout_minutes_check
      check (
        session_timeout_minutes = 0
        or session_timeout_minutes between 5 and 10080
      );
  end if;
end $$;

comment on column public.user_settings.session_timeout_minutes is
  'Application idle sign-out in minutes. 0 disables automatic sign-out; default is 120.';
