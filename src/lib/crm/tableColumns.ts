export interface CrmColumnOption {
  id: string;
  label: string;
  group: 'main' | 'additional' | 'source';
}

export const CRM_COLUMN_OPTIONS = {
  crm_companies: [
    { id: 'name', label: 'Company', group: 'main' },
    { id: 'industry', label: 'Industry', group: 'main' },
    { id: 'location', label: 'Location', group: 'main' },
    { id: 'phone', label: 'Phone', group: 'main' },
    { id: 'website', label: 'Website', group: 'main' },
    { id: 'domain', label: 'Domain', group: 'additional' },
    { id: 'address_line_1', label: 'Address line 1', group: 'additional' },
    { id: 'address_line_2', label: 'Address line 2', group: 'additional' },
    { id: 'city', label: 'City', group: 'additional' },
    { id: 'state_region', label: 'State / region', group: 'additional' },
    { id: 'postal_code', label: 'Postal code', group: 'additional' },
    { id: 'country', label: 'Country', group: 'additional' },
    { id: 'created_at', label: 'Created', group: 'additional' },
    { id: 'updated_at', label: 'Updated', group: 'additional' },
    { id: 'source', label: 'Source', group: 'source' },
    { id: 'contact_count', label: 'Contacts', group: 'source' },
    { id: 'deal_count', label: 'Deals', group: 'source' },
    { id: 'task_count', label: 'Tasks', group: 'source' },
  ],
  crm_contacts: [
    { id: 'full_name', label: 'Contact', group: 'main' },
    { id: 'company', label: 'Company', group: 'main' },
    { id: 'job_title', label: 'Role', group: 'main' },
    { id: 'email', label: 'Email', group: 'main' },
    { id: 'phone', label: 'Phone', group: 'main' },
    { id: 'first_name', label: 'First name', group: 'additional' },
    { id: 'last_name', label: 'Last name', group: 'additional' },
    { id: 'created_at', label: 'Created', group: 'additional' },
    { id: 'updated_at', label: 'Updated', group: 'additional' },
    { id: 'source', label: 'Source', group: 'source' },
    { id: 'deal_count', label: 'Deals', group: 'source' },
    { id: 'task_count', label: 'Tasks', group: 'source' },
  ],
  crm_deals: [
    { id: 'name', label: 'Deal', group: 'main' },
    { id: 'company', label: 'Company', group: 'main' },
    { id: 'stage', label: 'Stage', group: 'main' },
    { id: 'status', label: 'Status', group: 'main' },
    { id: 'amount', label: 'Value', group: 'main' },
    { id: 'follow_up_at', label: 'Follow up', group: 'main' },
    { id: 'currency', label: 'Currency', group: 'additional' },
    { id: 'owner_user_id', label: 'Owner ID', group: 'additional' },
    { id: 'last_call_at', label: 'Last call', group: 'additional' },
    { id: 'created_at', label: 'Created', group: 'additional' },
    { id: 'updated_at', label: 'Updated', group: 'additional' },
    { id: 'source', label: 'Source', group: 'source' },
    { id: 'task_count', label: 'Tasks', group: 'source' },
  ],
} satisfies Record<string, CrmColumnOption[]>;
