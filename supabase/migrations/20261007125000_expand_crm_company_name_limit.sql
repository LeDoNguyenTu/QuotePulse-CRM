alter table public.crm_companies
  drop constraint crm_companies_name_check,
  add constraint crm_companies_name_check
    check (length(btrim(name)) between 1 and 500);
