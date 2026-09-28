import { describe, expect, it } from 'vitest';
import { crmKeys } from './queryKeys';

describe('CRM query keys', () => {
  it('scopes every key to the workspace', () => {
    expect(crmKeys.companies('workspace-a', { page: 2, search: 'Acme' })).toEqual([
      'crm', 'workspace-a', 'companies', { page: 2, search: 'Acme' },
    ]);
    expect(crmKeys.contacts('workspace-b', { page: 1, search: '' })).toEqual([
      'crm', 'workspace-b', 'contacts', { page: 1, search: '' },
    ]);
    expect(crmKeys.deals('workspace-c', { page: 3, search: '', status: 'open' })).toEqual([
      'crm', 'workspace-c', 'deals', { page: 3, search: '', status: 'open' },
    ]);
  });

  it('provides resource prefixes for targeted invalidation', () => {
    expect(crmKeys.companyRoot('workspace-a')).toEqual(['crm', 'workspace-a', 'companies']);
    expect(crmKeys.contactRoot('workspace-a')).toEqual(['crm', 'workspace-a', 'contacts']);
    expect(crmKeys.dealRoot('workspace-a')).toEqual(['crm', 'workspace-a', 'deals']);
  });
});
