import { describe, expect, it } from 'vitest';
import { buildRestoreSet } from './archiveRestoreRecord';

describe('selective archive restore dependencies', () => {
  it('restores a company before a dependent contact or deal', async () => {
    const company = { id: 'company-1', owner_id: 'owner-1', name_clean: 'Northstar' };
    const contact = { id: 'contact-1', owner_id: 'owner-1', company_id: 'company-1' };
    await expect(buildRestoreSet('contacts', contact, 'owner-1', async (table, id) => table === 'companies' && id === 'company-1' ? company : null))
      .resolves.toEqual([{ table: 'companies', row: company }, { table: 'contacts', row: contact }]);
  });

  it('refuses missing dependencies and cross-owner rows', async () => {
    await expect(buildRestoreSet('deals', { id: 'deal-1', owner_id: 'owner-1', company_id: 'missing' }, 'owner-1', async () => null)).rejects.toThrow(/dependency/i);
    await expect(buildRestoreSet('companies', { id: 'company-1', owner_id: 'other' }, 'owner-1', async () => null)).rejects.toThrow(/owner/i);
  });
});
