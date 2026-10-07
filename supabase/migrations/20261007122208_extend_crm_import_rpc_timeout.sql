alter function public.crm_commit_import_with_customer_status_review(
  uuid, text, text, text, integer, text, jsonb, text, text, jsonb, jsonb
)
set statement_timeout to '60s';
