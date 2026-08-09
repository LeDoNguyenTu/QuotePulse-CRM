-- Supabase projects created after the 2026 Data API auto-exposure change no
-- longer receive implicit table privileges. RLS still decides which rows the
-- authenticated user can access; these grants only expose the operations used
-- by the browser application.

grant select on table
  public.industries,
  public.companies,
  public.deals,
  public.contacts,
  public.attachments,
  public.kyc_profiles,
  public.email_templates,
  public.email_sends,
  public.user_settings,
  public.hubspot_property_catalog,
  public.job_source_configs,
  public.job_opportunities
to authenticated;

grant insert, update, delete on table
  public.companies,
  public.contacts,
  public.email_templates,
  public.job_source_configs
to authenticated;

grant insert, update on table public.user_settings to authenticated;
grant update on table public.kyc_profiles to authenticated;

-- queue_bulk_email validates consent, suppressions, cooldowns and unsubscribe
-- tokens as one operation. Run that narrow RPC with its owner's privileges and
-- keep clients from bypassing it with direct queue/token inserts.
alter function public.queue_bulk_email(jsonb, boolean, text) security definer;
revoke insert on table public.email_sends, public.email_unsubscribe_tokens from authenticated;
revoke select on table public.email_suppressions from authenticated;
drop policy if exists "email_unsubscribe_tokens_owner_insert" on public.email_unsubscribe_tokens;

grant select on table public.company_dashboard, public.company_industries to authenticated;
