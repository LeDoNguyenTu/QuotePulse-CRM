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

insert into email_templates (name, industry, subject, body, from_email) values
  (
    'Generic re-engagement',
    null,
    'Reconnecting with {{company_name}}',
    E'Hi {{contact_name}},\n\nWe worked with {{company_name}} previously and wanted to reconnect. We''ve since expanded what we offer for teams in {{industry}} and would love to share a quick update.\n\nWould you be open to a short call this week?\n\nBest regards',
    null
  )
on conflict do nothing;
