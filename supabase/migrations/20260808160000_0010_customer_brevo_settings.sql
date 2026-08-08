-- Per-owner Brevo credentials: configured in Settings and read only by the
-- queue worker for the same email-send owner.
alter table public.user_settings
  add column if not exists brevo_api_key text,
  add column if not exists brevo_sender_name text;

comment on column public.user_settings.brevo_api_key is
  'Customer-owned Brevo API key, configured from Settings and never shared across owners.';
comment on column public.user_settings.brevo_sender_name is
  'Optional display name for the customer-owned verified Brevo sender.';
