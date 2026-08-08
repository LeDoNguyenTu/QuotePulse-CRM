import { describe, expect, it } from 'vitest';
import { chunkPropertyNames, mergeHubspotProperties } from './hubspotProperties';

describe('HubSpot property helpers', () => {
  it('splits a property list without dropping or duplicating names', () => {
    const properties = ['dealname', 'amount', 'custom_alpha', 'custom_beta'];
    expect(chunkPropertyNames(properties, 18)).toEqual([
      ['dealname', 'amount'],
      ['custom_alpha'],
      ['custom_beta'],
    ]);
  });

  it('merges property responses while retaining existing values', () => {
    expect(mergeHubspotProperties({ dealname: 'Renewal' }, { amount: '1200' })).toEqual({
      dealname: 'Renewal',
      amount: '1200',
    });
  });
});
