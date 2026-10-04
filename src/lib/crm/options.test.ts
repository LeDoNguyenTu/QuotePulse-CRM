import { describe, expect, it, vi } from 'vitest';
import { collectCrmOptionPages, CRM_CUSTOMER_STATUSES, mergeCustomerStatusOptions } from './options';

describe('CRM option pagination', () => {
  it('collects every page until the source returns a short page', async () => {
    const fetchPage = vi.fn()
      .mockResolvedValueOnce([{ id: '1' }, { id: '2' }])
      .mockResolvedValueOnce([{ id: '3' }]);

    await expect(collectCrmOptionPages(fetchPage, 2)).resolves.toEqual([
      { id: '1' }, { id: '2' }, { id: '3' },
    ]);
    expect(fetchPage).toHaveBeenNthCalledWith(1, 0, 1);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 2, 3);
  });
});

describe('CRM customer status options', () => {
  it('provides the standard customer lifecycle choices', () => {
    expect(CRM_CUSTOMER_STATUSES).toEqual([
      'Current Customer', 'Prospect', 'Former Customer', 'Maintenance Customer',
    ]);
  });

  it('keeps trimmed custom workbook statuses alongside standard choices', () => {
    expect(mergeCustomerStatusOptions([' Former Maintenance Customer ', 'Prospect', '']))
      .toEqual([
        'Current Customer', 'Prospect', 'Former Customer', 'Maintenance Customer',
        'Former Maintenance Customer',
      ]);
  });
});
