import { describe, expect, it } from 'vitest';
import { crmDetailSpec } from './detailQueries';

describe('Sales CRM detail query plans', () => {
  it('keeps company associations and lineage inside the active workspace', () => {
    const spec = crmDetailSpec('company', 'workspace-1', 'company-1');

    expect(spec.primary).toMatchObject({
      table: 'crm_companies',
      workspaceId: 'workspace-1',
      recordId: 'company-1',
    });
    expect(spec.associations).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: 'crm_contacts', foreignKey: 'company_id' }),
      expect.objectContaining({ table: 'crm_deals', foreignKey: 'company_id' }),
    ]));
    expect(spec.lineage).toMatchObject({ foreignKey: 'company_id', workspaceId: 'workspace-1' });
  });

  it('uses join rows for contact deals and deal contacts without an N+1 query', () => {
    const contact = crmDetailSpec('contact', 'workspace-1', 'contact-1');
    const deal = crmDetailSpec('deal', 'workspace-1', 'deal-1');

    expect(contact.associations).toEqual([
      expect.objectContaining({ table: 'crm_deal_contacts', foreignKey: 'contact_id' }),
    ]);
    expect(contact.associations[0].select).toContain('deal:crm_deals');
    expect(deal.associations).toEqual([
      expect.objectContaining({ table: 'crm_deal_contacts', foreignKey: 'deal_id' }),
    ]);
    expect(deal.associations[0].select).toContain('contact:crm_contacts');
  });

  it('rejects blank workspace and record identifiers before a query is built', () => {
    expect(() => crmDetailSpec('company', '', 'company-1')).toThrow('workspace');
    expect(() => crmDetailSpec('deal', 'workspace-1', '  ')).toThrow('record');
  });
});
