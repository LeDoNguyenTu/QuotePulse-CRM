do $$
declare
  test_owner uuid;
begin
  select id into test_owner from auth.users where email = 'browser.qa@example.test';
  if test_owner is null then raise exception 'browser QA user is missing'; end if;

  insert into public.user_settings (user_id, table_column_preferences)
  values (test_owner, '{}'::jsonb)
  on conflict (user_id) do update set table_column_preferences = excluded.table_column_preferences;

  insert into public.companies (
    id, owner_id, name_clean, name_raw, industry, hubspot_properties,
    hubspot_properties_schema_version, source_priority
  ) values (
    '33333333-3333-3333-3333-333333333333', test_owner,
    'Synthetic QA Company', 'SYNTHETIC QA COMPANY PTE LTD', 'Testing',
    '{"website":"https://example.test"}'::jsonb, 'vqa', 'current'
  );

  insert into public.deals (
    id, owner_id, hubspot_deal_id, company_id, deal_name_raw, product,
    deal_stage, pipeline, amount, hubspot_created_at, hubspot_modified_at,
    hubspot_properties, hubspot_properties_schema_version
  ) values (
    '44444444-4444-4444-4444-444444444444', test_owner, 'qa-deal-1',
    '33333333-3333-3333-3333-333333333333',
    'TEST PRODUCT - SYNTHETIC QA COMPANY', 'Test Product', 'qualified', 'qa-pipeline', 1250,
    '2026-08-01T01:00:00Z', '2026-08-08T02:00:00Z',
    '{"amount":"1250","custom_region":"Singapore","never_used":null}'::jsonb, 'vqa'
  );

  insert into public.contacts (
    id, owner_id, company_id, full_name, email, phone, role_title, source,
    is_primary_contact, hubspot_properties, hubspot_properties_schema_version
  ) values (
    '55555555-5555-5555-5555-555555555555', test_owner,
    '33333333-3333-3333-3333-333333333333',
    'Synthetic QA Contact', 'qa-contact@example.test', '+65 6000 0000', 'QA Lead',
    'hubspot_contact', true,
    '{"email":"qa-contact@example.test","linkedin_url":"https://linkedin.example.test/qa","empty_contact_field":null}'::jsonb,
    'vqa'
  );

  insert into public.hubspot_property_catalog (
    owner_id, object_type, property_name, label, display_order, hubspot_defined, has_value
  ) values
    (test_owner, 'companies', 'website', 'Website', 1, true, true),
    (test_owner, 'companies', 'empty_company_field', 'Empty company field', 2, false, false),
    (test_owner, 'deals', 'amount', 'Amount', 1, true, true),
    (test_owner, 'deals', 'custom_region', 'Custom region', 2, false, true),
    (test_owner, 'deals', 'never_used', 'Never used', 3, false, false),
    (test_owner, 'contacts', 'email', 'Email', 1, true, true),
    (test_owner, 'contacts', 'linkedin_url', 'LinkedIn URL', 2, false, true),
    (test_owner, 'contacts', 'empty_contact_field', 'Empty contact field', 3, false, false);
end;
$$;
