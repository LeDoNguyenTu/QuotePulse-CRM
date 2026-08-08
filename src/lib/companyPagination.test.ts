import { describe, expect, it } from 'vitest';
import { companyCountKey, companyPageKey, companyRange, companySort } from './companyPagination';

describe('company pagination', () => {
  it('does not include the page in the cached count key', () => {
    expect(companyCountKey({ search: 'acme', page: 0, pageSize: 50 })).toEqual(
      companyCountKey({ search: 'acme', page: 3, pageSize: 50 })
    );
  });

  it('calculates page ranges from the configured page size', () => {
    expect(companyRange(2, 50)).toEqual({ from: 100, to: 149 });
    expect(companyPageKey({ page: 2, pageSize: 50 })).not.toEqual(
      companyPageKey({ page: 1, pageSize: 50 })
    );
  });

  it('uses id as the deterministic final sort key', () => {
    expect(companySort[companySort.length - 1]).toEqual({ column: 'id', ascending: true });
  });

  it('keeps HubSpot activity date filters in page and count cache keys', () => {
    expect(companyCountKey({ activity_from: '2026-08-01' })).not.toEqual(
      companyCountKey({ activity_from: '2026-08-02' })
    );
    expect(companyPageKey({ activity_to: '2026-08-31' })[1]).toMatchObject({
      activity_to: '2026-08-31',
    });
  });
});
