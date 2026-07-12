-- Optional seed data. Applied by `supabase db reset` (local) after migrations.
insert into industries (name) values
  ('Technology'),
  ('Manufacturing'),
  ('Healthcare'),
  ('Retail'),
  ('Construction'),
  ('Professional Services'),
  ('Finance'),
  ('Hospitality'),
  ('Education'),
  ('Logistics')
on conflict (name) do nothing;

-- NOTE: email_templates is per-user since 0005_tenancy.sql (owner_id not null,
-- default auth.uid()). A seed INSERT runs with no auth context, so it cannot
-- own a template. Users create their own templates on the Templates page.
