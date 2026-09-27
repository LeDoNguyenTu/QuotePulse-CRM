import { describe, expect, it } from 'vitest';
import { workspaceNavigation } from './workspaceNavigation';

describe('workspace navigation', () => {
  it('exposes every required Sales CRM module in customer-facing order', () => {
    expect(workspaceNavigation('sales_crm', 'sales-id').map((item) => item.label)).toEqual([
      'Dashboard',
      'Companies',
      'Contacts',
      'Deals',
      'Tasks',
      'Email Campaigns',
      'Imports',
      'PST Extractor',
      'Settings',
    ]);
  });

  it('keeps every legacy capability under the selected legacy workspace', () => {
    expect(workspaceNavigation('legacy', 'legacy-id')).toEqual([
      { to: '/w/legacy-id/legacy', label: 'Dashboard', end: true },
      { to: '/w/legacy-id/legacy/uploads', label: 'Uploaded files' },
      { to: '/w/legacy-id/legacy/templates', label: 'Templates' },
      { to: '/w/legacy-id/legacy/trash', label: 'Recycle bin' },
      { to: '/w/legacy-id/legacy/settings', label: 'Settings' },
    ]);
  });
});
