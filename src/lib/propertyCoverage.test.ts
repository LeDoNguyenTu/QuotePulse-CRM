import { describe, expect, test } from 'vitest';
import { splitPropertiesByCoverage } from './propertyCoverage';

describe('splitPropertiesByCoverage', () => {
  test('keeps every catalog field and separates fields with no imported value', () => {
    const catalog = [
      { property_name: 'website', label: 'Website' },
      { property_name: 'empty_custom_field', label: 'Empty custom field' },
      { property_name: 'annualrevenue', label: 'Annual revenue' },
    ];

    expect(splitPropertiesByCoverage(catalog, ['website', 'annualrevenue'])).toEqual({
      available: [
        { property_name: 'website', label: 'Website' },
        { property_name: 'annualrevenue', label: 'Annual revenue' },
      ],
      hidden: [{ property_name: 'empty_custom_field', label: 'Empty custom field' }],
    });
  });
});
