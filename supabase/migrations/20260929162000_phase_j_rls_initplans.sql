-- Cache auth.uid() once per statement in the seven workspace policies added
-- after the original query-performance hardening migration.

alter policy crm_email_campaigns_member_select on public.crm_email_campaigns
using (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = crm_email_campaigns.workspace_id
    and m.user_id = (select auth.uid())
));

alter policy crm_campaign_recipients_member_select on public.crm_campaign_recipients
using (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = crm_campaign_recipients.workspace_id
    and m.user_id = (select auth.uid())
));

alter policy crm_mailbox_imports_member_select on public.crm_mailbox_imports
using (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = crm_mailbox_imports.workspace_id
    and m.user_id = (select auth.uid())
));

alter policy crm_mail_messages_member_select on public.crm_mail_messages
using (exists (
  select 1
  from public.workspace_members m
  join public.crm_mailbox_imports i
    on i.workspace_id = m.workspace_id
   and i.id = crm_mail_messages.mailbox_import_id
  where m.workspace_id = crm_mail_messages.workspace_id
    and m.user_id = (select auth.uid())
    and i.status in ('completed', 'completed_with_warnings')
));

alter policy crm_mail_message_contacts_member_select on public.crm_mail_message_contacts
using (exists (
  select 1
  from public.workspace_members m
  join public.crm_mail_messages mm
    on mm.workspace_id = m.workspace_id
   and mm.id = crm_mail_message_contacts.mail_message_id
  join public.crm_mailbox_imports i
    on i.workspace_id = mm.workspace_id
   and i.id = mm.mailbox_import_id
  where m.workspace_id = crm_mail_message_contacts.workspace_id
    and m.user_id = (select auth.uid())
    and i.status in ('completed', 'completed_with_warnings')
));

alter policy workspace_archive_tables_member_select on public.workspace_archive_tables
using (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = workspace_archive_tables.workspace_id
    and m.user_id = (select auth.uid())
));

alter policy workspace_archive_objects_member_select on public.workspace_archive_objects
using (exists (
  select 1 from public.workspace_members m
  where m.workspace_id = workspace_archive_objects.workspace_id
    and m.user_id = (select auth.uid())
));
