export interface CrmColumnOption {
  id: string;
  label: string;
}

export const CRM_COLUMN_OPTIONS = {
  crm_companies: [
    { id: 'name', label: 'Company' },
    { id: 'industry', label: 'Industry' },
    { id: 'location', label: 'Location' },
    { id: 'phone', label: 'Phone' },
    { id: 'website', label: 'Website' },
    { id: 'domain', label: 'Domain' },
  ],
  crm_contacts: [
    { id: 'full_name', label: 'Contact' },
    { id: 'company', label: 'Company' },
    { id: 'job_title', label: 'Role' },
    { id: 'email', label: 'Email' },
    { id: 'phone', label: 'Phone' },
  ],
  crm_deals: [
    { id: 'name', label: 'Deal' },
    { id: 'company', label: 'Company' },
    { id: 'stage', label: 'Stage' },
    { id: 'status', label: 'Status' },
    { id: 'amount', label: 'Value' },
    { id: 'last_call_at', label: 'Last call' },
    { id: 'follow_up_at', label: 'Follow up' },
  ],
} satisfies Record<string, CrmColumnOption[]>;
