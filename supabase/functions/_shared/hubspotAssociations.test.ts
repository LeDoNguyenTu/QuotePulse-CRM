import { describe, expect, test } from 'vitest';
import { associatedObjectIds } from './hubspotAssociations';

describe('associatedObjectIds', () => {
  test('deduplicates associated company and contact IDs for batch hydration', () => {
    const objects = [
      { id: 'deal-1', associations: { companies: { results: [{ id: 'company-1', type: 'deal_to_company' }] }, contacts: { results: [{ id: 'contact-1', type: 'deal_to_contact' }] } } },
      { id: 'deal-2', associations: { companies: { results: [{ id: 'company-1', type: 'deal_to_company' }, { id: 'company-2', type: 'deal_to_company' }] }, contacts: { results: [{ id: 'contact-2', type: 'deal_to_contact' }] } } },
    ];

    expect(associatedObjectIds(objects, 'companies')).toEqual(['company-1', 'company-2']);
    expect(associatedObjectIds(objects, 'contacts')).toEqual(['contact-1', 'contact-2']);
  });
});
