export type CrmDealStatus = 'open' | 'won' | 'lost' | 'on_hold';

export interface CrmAuditFields {
  id: string;
  workspace_id: string;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface CrmCompany extends CrmAuditFields {
  name: string;
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
}

export interface CrmContact extends CrmAuditFields {
  company_id: string | null;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  company?: Pick<CrmCompany, 'id' | 'name' | 'industry'> | null;
}

export interface CrmDeal extends CrmAuditFields {
  company_id: string | null;
  name: string;
  stage: string;
  amount: number | null;
  currency: string;
  owner_user_id: string | null;
  status: CrmDealStatus;
  last_call_at: string | null;
  follow_up_at: string | null;
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
  created_by: string;
  created_at: string;
  source_column?: string | null;
  source_row_number?: number | null;
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
  company?: { id: string; name: string } | null;
  contact?: { id: string; full_name: string | null } | null;
  deal?: { id: string; name: string } | null;
}

export interface CrmEmailCampaign extends CrmAuditFields {
  name: string;
  template_id: string | null;
  subject: string;
  body: string;
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
>;

export type CrmContactInput = Pick<
  CrmContact,
  'company_id' | 'first_name' | 'last_name' | 'full_name' | 'email' | 'phone' | 'job_title'
>;

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
>;

export interface CrmPage<T> {
  rows: T[];
  count: number;
}
