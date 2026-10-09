import { describe, expect, it } from 'vitest';
import { archiveCellValue, archiveColumnOptions } from './archiveTable';

describe('archive table parity helpers', () => {
  it('exposes live columns plus imported HubSpot fields discovered in R2 rows', () => {
    const options = archiveColumnOptions('contacts', [{ full_name: 'Ada', hubspot_properties: { department: 'Finance' } }]);
    expect(options.map((column) => column.id)).toEqual(expect.arrayContaining(['full_name', 'role_title', 'source', 'department']));
    expect(archiveCellValue({ hubspot_properties: { department: 'Finance' } }, 'department')).toBe('Finance');
  });

  it('keeps a selected imported field visible across pages where it is null', () => {
    expect(archiveColumnOptions('deals', [], ['custom_deal_field'])).toContainEqual({
      id: 'custom_deal_field',
      label: 'custom deal field',
      group: 'available',
    });
  });

  it('uses the complete durable HubSpot catalog and its human labels', () => {
    const options = archiveColumnOptions('companies', [], [], [{ property_name: 'annualrevenue', label: 'Annual revenue', has_value: true }]);
    expect(options).toContainEqual({ id: 'annualrevenue', label: 'Annual revenue', group: 'available' });
  });
});
