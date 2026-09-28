import { describe, expect, it } from 'vitest';
import { crmRecordPath, resolveSalesModule } from './salesRoutes';

describe('Sales CRM route dispatch', () => {
  it('resolves the live dashboard and ledgers', () => {
    expect(resolveSalesModule(undefined)).toBe('dashboard');
    expect(resolveSalesModule('companies')).toBe('companies');
    expect(resolveSalesModule('contacts')).toBe('contacts');
    expect(resolveSalesModule('deals')).toBe('deals');
    expect(resolveSalesModule('imports')).toBe('imports');
  });

  it('keeps planned modules as placeholders and rejects unknown routes', () => {
    expect(resolveSalesModule('tasks')).toBe('placeholder');
    expect(resolveSalesModule('not-a-module')).toBe('missing');
  });

  it('resolves record detail routes only for live CRM ledgers', () => {
    expect(resolveSalesModule('companies', 'company-id')).toBe('company-detail');
    expect(resolveSalesModule('contacts', 'contact-id')).toBe('contact-detail');
    expect(resolveSalesModule('deals', 'deal-id')).toBe('deal-detail');
    expect(resolveSalesModule('imports', 'import-id')).toBe('missing');
    expect(resolveSalesModule('tasks', 'task-id')).toBe('missing');
  });

  it('builds workspace-safe detail links for each CRM record kind', () => {
    expect(crmRecordPath('workspace 1', 'company', 'company/1')).toBe(
      '/w/workspace%201/sales/companies/company%2F1',
    );
    expect(crmRecordPath('workspace-1', 'contact', 'contact-1')).toBe(
      '/w/workspace-1/sales/contacts/contact-1',
    );
    expect(crmRecordPath('workspace-1', 'deal', 'deal-1')).toBe(
      '/w/workspace-1/sales/deals/deal-1',
    );
  });
});
