import { describe, expect, it } from 'vitest';
import type { ParsedWorkbook } from '../uploadedFileWorkbook';
import {
  buildCustomerStatusReviewIndex,
  inferCustomerStatusFromSource,
  normalizeImportedCompanyName,
} from './customerStatusImport';

const workbook: ParsedWorkbook = {
  sheets: [
    {
      name: 'Active customers',
      headers: ['Name', 'Customer Status'],
      rows: [
        { Name: 'Alpha Pte Ltd', 'Customer Status': '' },
        { Name: 'Shared & Co.', 'Customer Status': '' },
        { Name: 'Repeated Ltd', 'Customer Status': '' },
        { Name: 'REPEATED LTD', 'Customer Status': '' },
      ],
    },
    {
      name: 'Inactive Customers',
      headers: ['Name', 'Customer Status'],
      rows: [
        { Name: 'Shared and Co', 'Customer Status': '' },
        { Name: 'Former Ltd', 'Customer Status': '' },
      ],
    },
  ],
};

describe('support-customer workbook status recognition', () => {
  it('maps support tabs to maintenance and former customer statuses', () => {
    expect(inferCustomerStatusFromSource('Support customers.xlsx', 'Active customers')).toBe('Maintenance Customer');
    expect(inferCustomerStatusFromSource('Support customers.xlsx', 'Inactive Customers')).toBe('Former Customer');
  });

  it('keeps generic active customer worksheets backward compatible', () => {
    expect(inferCustomerStatusFromSource('Customer Contacts.xlsx', 'Active customers')).toBe('Current Customer');
    expect(inferCustomerStatusFromSource('Current AMC customers.xlsx', 'Customers')).toBe('Maintenance Customer');
    expect(inferCustomerStatusFromSource('Current AMP customers.xlsx', 'Sheet1')).toBe('Maintenance Customer');
  });

  it('flags cross-tab and within-tab duplicate names for review', () => {
    const review = buildCustomerStatusReviewIndex('Support customers.xlsx', workbook);

    expect(review.get(normalizeImportedCompanyName('Shared & Co.'))).toMatch(/active and inactive/i);
    expect(review.get(normalizeImportedCompanyName('Repeated Ltd'))).toMatch(/more than once/i);
    expect(review.has(normalizeImportedCompanyName('Alpha Pte Ltd'))).toBe(false);
    expect(review.has(normalizeImportedCompanyName('Former Ltd'))).toBe(false);
  });

  it('flags an explicit support status that conflicts with the worksheet category', () => {
    const conflicting: ParsedWorkbook = {
      sheets: [{
        name: 'Active customers',
        headers: ['Name', 'Customer Status'],
        rows: [
          { Name: 'Expected Maintenance', 'Customer Status': 'Maintenance Customer' },
          { Name: 'Suspicious Current', 'Customer Status': 'Current Customer' },
        ],
      }, {
        name: 'Inactive Customers',
        headers: ['Name', 'Customer Status'],
        rows: [{ Name: 'Expected Former', 'Customer Status': 'Former Customer' }],
      }],
    };

    const review = buildCustomerStatusReviewIndex('Support customers.xlsx', conflicting);
    expect(review.has(normalizeImportedCompanyName('Expected Maintenance'))).toBe(false);
    expect(review.has(normalizeImportedCompanyName('Expected Former'))).toBe(false);
    expect(review.get(normalizeImportedCompanyName('Suspicious Current'))).toMatch(/conflicts.*active customers/i);
  });
});
