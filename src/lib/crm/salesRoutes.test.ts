import { describe, expect, it } from 'vitest';
import { resolveSalesModule } from './salesRoutes';

describe('Sales CRM route dispatch', () => {
  it('resolves the live dashboard and ledgers', () => {
    expect(resolveSalesModule(undefined)).toBe('dashboard');
    expect(resolveSalesModule('companies')).toBe('companies');
    expect(resolveSalesModule('contacts')).toBe('contacts');
    expect(resolveSalesModule('deals')).toBe('deals');
  });

  it('keeps planned modules as placeholders and rejects unknown routes', () => {
    expect(resolveSalesModule('tasks')).toBe('placeholder');
    expect(resolveSalesModule('not-a-module')).toBe('missing');
  });
});
