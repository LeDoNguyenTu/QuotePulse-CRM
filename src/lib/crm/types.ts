export type CrmDealStatus = 'open' | 'won' | 'lost' | 'on_hold';
export type CrmContactRecordState = 'unverified' | 'verified' | 'outdated';

export interface CrmAuditFields {
  id: string;
  workspace_id: string;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface CrmSourceSummary {
  id: string;
  database_id: string;
  filename: string;
  source_type: 'workbook' | 'pst';
  headers?: string[];
  row_index_available?: boolean;
}

export interface CrmListMetadata {
  primary_source?: CrmSourceSummary | null;
  source_count?: number;
  source_row_number?: number | null;
  task_count?: number;
}

export interface CrmCompany extends CrmAuditFields, CrmListMetadata {
  name: string;
  customer_status: string | null;
  customer_status_review_required: boolean;
  customer_status_review_reason: string | null;
  industry: string | null;
  website: string | null;
  domain: string | null;
  phone: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state_region: string | null;
  postal_code: string | null;
  country: string | null;
  field_sources?: import('./companyEnrichment').CompanyFieldSources;
  contact_count?: number;
  deal_count?: number;
  last_contact_at?: string | null;
  follow_up_at?: string | null;
  last_call_outcome?: string | null;
  latest_activity_at?: string | null;
  latest_activity_preview?: string | null;
}

export interface CrmContact extends CrmAuditFields, CrmListMetadata {
  company_id: string | null;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  record_state: CrmContactRecordState;
  is_hidden: boolean;
  duplicate_review_of: string | null;
  deal_count?: number;
  company?: Pick<CrmCompany, 'id' | 'name' | 'industry'> | null;
}

export interface CrmDeal extends CrmAuditFields, CrmListMetadata {
  company_id: string | null;
  name: string;
  stage: string;
  amount: number | null;
  currency: string;
  owner_user_id: string | null;
  status: CrmDealStatus;
  last_call_at: string | null;
  follow_up_at: string | null;
  call_outcome: string | null;
  appointment_status: string | null;
  company?: Pick<CrmCompany, 'id' | 'name'> | null;
}

export interface CrmActivity {
  id: string;
  workspace_id: string;
  company_id: string | null;
  deal_id: string | null;
  contact_id: string | null;
  kind: 'note' | 'call' | 'task_event';
  body: string;
  occurred_at: string;
  call_outcome: string | null;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  source_column?: string | null;
  source_row_number?: number | null;
  source_import?: { id: string; database_id: string; original_filename: string } | null;
  task?: { id: string; title: string; status: CrmTask['status']; due_at: string | null } | null;
}

export interface CrmTask {
  id: string;
  workspace_id: string;
  company_id: string | null;
  deal_id: string | null;
  contact_id: string | null;
  title: string;
  description: string | null;
  due_at: string | null;
  reminder_at: string | null;
  status: 'open' | 'in_progress' | 'completed' | 'cancelled';
  assignee_id: string | null;
  completed_at: string | null;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  activity_id?: string | null;
  company?: { id: string; name: string } | null;
  contact?: { id: string; full_name: string | null } | null;
  deal?: { id: string; name: string } | null;
}

export interface CrmNotification {
  id: string;
  workspace_id: string;
  user_id: string;
  task_id: string | null;
  kind: 'task_reminder';
  status: 'unread' | 'read' | 'dismissed';
  title: string;
  body: string | null;
  due_at: string | null;
  reminder_at: string | null;
  read_at: string | null;
  created_by: string;
  created_at: string;
  task?: Pick<CrmTask, 'id' | 'company_id' | 'contact_id' | 'deal_id'> | null;
}

export interface CrmEmailCampaign extends CrmAuditFields {
  name: string;
  template_id: string | null;
  subject: string;
  body: string;
  body_html: string | null;
  body_text: string;
  provider: 'microsoft_graph' | 'brevo';
  cooldown_seconds: number;
  audience_filter: Record<string, unknown>;
  status: 'draft' | 'queued' | 'active' | 'completed' | 'cancelled';
  recipient_count: number;
  queued_count: number;
  scheduled_count: number;
  sending_count: number;
  retrying_count: number;
  sent_count: number;
  deferred_count: number;
  blocked_count: number;
  failed_count: number;
}

export interface CrmCampaignRecipientReport {
  id: string;
  workspace_id: string;
  campaign_id: string;
  contact_id: string | null;
  company_id: string | null;
  email_normalized: string;
  contact_name: string | null;
  company_name: string | null;
  industry: string | null;
  recipient_status: 'queued' | 'scheduled' | 'sending' | 'retrying' | 'sent' | 'failed' | 'blocked' | 'deferred';
  status: 'queued' | 'scheduled' | 'sending' | 'retrying' | 'sent' | 'failed' | 'blocked' | 'deferred';
  blocked_reason: string | null;
  email_send_id: string | null;
  campaign_name: string;
  attempt_id: string | null;
  is_current_attempt: boolean;
  subject: string | null;
  body_rendered: string | null;
  body_html_rendered: string | null;
  provider: 'microsoft_graph' | 'brevo' | null;
  provider_message_id: string | null;
  attempt_count: number | null;
  scheduled_at: string | null;
  next_attempt_at: string | null;
  attempted_at: string | null;
  sent_at: string | null;
  failed_at: string | null;
  blocked_at: string | null;
  error_message: string | null;
  last_error_code: string | null;
  retry_of_id: string | null;
  send_created_at: string | null;
  send_updated_at: string | null;
}

export interface CrmEmailSendHistory {
  id: string;
  workspace_id: string;
  campaign_id: string | null;
  contact_id: string;
  company_id: string | null;
  to_email: string;
  subject: string | null;
  body_rendered: string | null;
  body_html_rendered: string | null;
  status: CrmCampaignRecipientReport['status'];
  provider: 'microsoft_graph' | 'brevo';
  provider_message_id: string | null;
  attempt_count: number;
  scheduled_at: string | null;
  next_attempt_at: string | null;
  attempted_at: string | null;
  sent_at: string | null;
  failed_at: string | null;
  blocked_at: string | null;
  error_message: string | null;
  last_error_code: string | null;
  retry_of_id: string | null;
  created_at: string;
  updated_at: string;
  campaign_name: string | null;
  is_current_attempt: boolean;
}

export type CrmCompanyInput = Pick<
  CrmCompany,
  | 'name'
  | 'industry'
  | 'website'
  | 'domain'
  | 'phone'
  | 'address_line_1'
  | 'address_line_2'
  | 'city'
  | 'state_region'
  | 'postal_code'
  | 'country'
> & {
  customer_status?: string | null;
  customer_status_review_required?: boolean;
  customer_status_review_reason?: string | null;
  field_sources?: import('./companyEnrichment').CompanyFieldSources;
};

export type CrmContactInput = Pick<
  CrmContact,
  'company_id' | 'first_name' | 'last_name' | 'full_name' | 'email' | 'phone' | 'job_title'
> & Partial<Pick<CrmContact, 'record_state' | 'is_hidden' | 'duplicate_review_of'>>;

export type CrmDealInput = Pick<
  CrmDeal,
  | 'company_id'
  | 'name'
  | 'stage'
  | 'amount'
  | 'currency'
  | 'owner_user_id'
  | 'status'
  | 'last_call_at'
  | 'follow_up_at'
> & Partial<Pick<CrmDeal, 'call_outcome' | 'appointment_status'>>;

export interface CrmPage<T> {
  rows: T[];
  count: number;
}
