import { describe, expect, it } from 'vitest';
import {
  HUBSPOT_OBJECT_BASE_COLUMNS,
  hubspotObjectCellValue,
  mergeHubspotColumnOptions,
} from './hubspotObjectTable';

describe('HubSpot object table model', () => {
  it('reads normalized deal columns before arbitrary HubSpot properties', () => {
    const row = {
      id: 'deal-1',
      amount: 1250,
      hubspot_properties: { amount: '999', custom_region: 'Singapore' },
    };

    expect(hubspotObjectCellValue(row, 'amount')).toBe(1250);
    expect(hubspotObjectCellValue(row, 'custom_region')).toBe('Singapore');
    expect(hubspotObjectCellValue(row, 'missing')).toBeNull();
  });

  it('keeps every catalog field while de-duplicating normalized columns', () => {
    const options = mergeHubspotColumnOptions('deals', [
      { property_name: 'amount', label: 'HubSpot amount', has_value: true },
      { property_name: 'custom_region', label: 'Custom region', has_value: true },
      { property_name: 'never_used', label: 'Never used', has_value: false },
    ]);

    expect(options.filter((option) => option.id === 'amount')).toHaveLength(1);
    expect(options).toEqual(expect.arrayContaining([
      { id: 'custom_region', label: 'Custom region', group: 'available' },
      { id: 'never_used', label: 'Never used', group: 'hidden' },
    ]));
    expect(HUBSPOT_OBJECT_BASE_COLUMNS.contacts.map((column) => column.id))
      .toEqual(expect.arrayContaining(['full_name', 'email', 'source']));
  });
});
