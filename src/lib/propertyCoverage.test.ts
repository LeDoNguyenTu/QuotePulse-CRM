import { describe, expect, test } from 'vitest';
import { fieldsWithImportedValues } from './propertyCoverage';

describe('fieldsWithImportedValues', () => {
  test('omits catalog fields that are empty for every imported company', () => {
    const catalog = [
      { property_name: 'website', label: 'Website' },
      { property_name: 'empty_custom_field', label: 'Empty custom field' },
      { property_name: 'annualrevenue', label: 'Annual revenue' },
    ];

    expect(fieldsWithImportedValues(catalog, ['website', 'annualrevenue'])).toEqual([
      { property_name: 'website', label: 'Website' },
      { property_name: 'annualrevenue', label: 'Annual revenue' },
    ]);
  });
});
