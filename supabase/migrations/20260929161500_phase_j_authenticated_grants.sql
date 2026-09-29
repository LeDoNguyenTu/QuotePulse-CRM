-- Normalize privileges on legacy tables. Older Supabase projects may retain
-- broad default authenticated grants even when newer migrations only grant the
-- intended operations. RLS is still required, but it is not a substitute for
-- least-privilege table grants.

revoke insert, update, delete on table
  public.industries,
  public.deals,
  public.attachments,
  public.email_sends,
  public.hubspot_property_catalog,
  public.job_opportunities
from authenticated;

revoke insert, delete on table public.kyc_profiles from authenticated;
revoke delete on table public.user_settings from authenticated;
revoke all on table
  public.email_unsubscribe_tokens,
  public.email_suppressions
from authenticated;

-- Reassert the browser operations that are intentionally supported.
grant select on table
  public.industries,
  public.deals,
  public.attachments,
  public.email_sends,
  public.hubspot_property_catalog,
  public.job_opportunities,
  public.kyc_profiles,
  public.user_settings
to authenticated;

grant update on table public.kyc_profiles to authenticated;
grant insert, update on table public.user_settings to authenticated;
