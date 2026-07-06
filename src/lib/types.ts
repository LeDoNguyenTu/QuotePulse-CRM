// Hand-written DB types. For a large project you would generate these with
// `supabase gen types typescript`, but these mirror 0001_init.sql exactly and
// keep the app dependency-free of the CLI.

export type SourcePriority = 'recycled' | 'deleted' | 'current';
export type ContactSource =
  | 'quote_pdf'
  | 'hubspot_contact'
  | 'note_section'
  | 'linkedin'
  | 'google'
  | 'manual';
export type AttachmentSource = 'quote' | 'generic';
export type SendStatus = 'queued' | 'sent' | 'failed' | 'blocked' | 'deferred';

export interface Company {
  id: string;
  name_clean: string;
  name_raw: string | null;
  industry: string | null;
  website: string | null;
  hubspot_company_id: string | null;
  source_priority: SourcePriority;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompanyDashboardRow {
  id: string;
  name_clean: string;
  name_raw: string | null;
  industry: string | null;
  website: string | null;
  source_priority: SourcePriority;
  created_at: string;
  updated_at: string;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  primary_contact_phone: string | null;
  has_quote: boolean;
  has_kyc: boolean;
  last_email_status: SendStatus | null;
  last_email_sent_at: string | null;
}

export interface Deal {
  id: string;
  hubspot_deal_id: string | null;
  company_id: string | null;
  deal_name_raw: string | null;
  deal_stage: string | null;
  is_archived: boolean;
  archived_at: string | null;
  pipeline: string | null;
  amount: number | null;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  company_id: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role_title: string | null;
  is_primary_contact: boolean;
  source: ContactSource;
  created_at: string;
  updated_at: string;
}

export interface Attachment {
  id: string;
  deal_id: string | null;
  hubspot_attachment_id: string | null;
  file_name: string | null;
  file_url: string | null;
  source_type: AttachmentSource;
  parsed: boolean;
  parsed_summary: ParsedQuoteSummary | null;
  created_at: string;
  updated_at: string;
}

export interface ParsedQuoteSummary {
  company_name?: string;
  address?: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  quote_number?: string;
  raw_text?: string;
  [key: string]: unknown;
}

export interface KycContact {
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
}

export interface KycEnrichedData {
  website?: string;
  linkedin?: string;
  contacts?: KycContact[];
  about?: string;
  address?: string;
  other_links?: string[];
  [key: string]: unknown;
}

export interface KycProfile {
  id: string;
  company_id: string;
  enriched_data: KycEnrichedData | null;
  primary_website: string | null;
  linkedin_company_url: string | null;
  other_links: string[] | null;
  last_enriched_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  industry: string | null;
  subject: string;
  body: string;
  from_email: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailSend {
  id: string;
  company_id: string | null;
  contact_id: string | null;
  template_id: string | null;
  to_email: string;
  subject: string | null;
  body_rendered: string | null;
  status: SendStatus;
  provider_message_id: string | null;
  provider_url: string | null;
  cooldown_seconds: number;
  sent_at: string | null;
  error_message: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserSettings {
  user_id: string;
  hubspot_token: string | null;
  ms_refresh_token: string | null;
  ms_account_email: string | null;
  nvidia_key: string | null;
  daily_send_limit: number;
  created_at: string;
  updated_at: string;
}

export interface Industry {
  id: string;
  name: string;
}

// Minimal Database shape for the typed supabase-js client. Only the pieces the
// frontend queries directly are listed; Edge Functions use their own service
// client and are not typed here.
//
// NOTE: supabase-js requires each table to include a `Relationships` array and
// each view a `Relationships` array — without it the client resolves Insert /
// Update types to `never`. We use `[]` since we don't need typed joins.
type Table<R> = { Row: R; Insert: Partial<R>; Update: Partial<R>; Relationships: [] };
type View<R> = { Row: R; Relationships: [] };

export interface Database {
  public: {
    Tables: {
      companies: Table<Company>;
      deals: Table<Deal>;
      contacts: Table<Contact>;
      attachments: Table<Attachment>;
      kyc_profiles: Table<KycProfile>;
      email_templates: Table<EmailTemplate>;
      email_sends: Table<EmailSend>;
      user_settings: Table<UserSettings>;
      industries: Table<Industry>;
    };
    Views: {
      company_dashboard: View<CompanyDashboardRow>;
    };
    Functions: Record<string, never>;
  };
}
