-- Phase J: indexes matching the exact Sales CRM list and timeline queries.
create index if not exists crm_activities_company_timeline_idx
  on public.crm_activities (workspace_id, company_id, occurred_at desc, id)
  where company_id is not null;

create index if not exists crm_activities_deal_timeline_idx
  on public.crm_activities (workspace_id, deal_id, occurred_at desc, id)
  where deal_id is not null;

create index if not exists crm_tasks_workspace_due_order_idx
  on public.crm_tasks (workspace_id, due_at, id);

create index if not exists crm_notifications_workspace_user_status_idx
  on public.crm_notifications (workspace_id, user_id, status, created_at desc);

create index if not exists crm_mail_messages_workspace_date_idx
  on public.crm_mail_messages (workspace_id, message_at desc nulls last, id);

drop index if exists public.crm_mail_messages_subject_search_idx;
create index crm_mail_messages_subject_search_idx
  on public.crm_mail_messages using gin (subject extensions.gin_trgm_ops);

create index if not exists crm_email_campaigns_workspace_created_idx
  on public.crm_email_campaigns (workspace_id, created_at desc, id);
