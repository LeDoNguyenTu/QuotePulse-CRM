import { describe, expect, it } from 'vitest';
import { clampPage, readDashboardState, writeDashboardState } from './dashboardState';

describe('dashboard URL state', () => {
  it('omits the default companies view and pagination', () => {
    const state = readDashboardState('');
    expect(state).toEqual({
      view: 'companies',
      companies: { page: 0, pageSize: 25 },
      deals: { search: '', page: 0 },
      contacts: { search: '', page: 0 },
    });
    expect(writeDashboardState(state)).toBe('');
  });

  it('round trips every company filter and uses human-readable one-based pages', () => {
    const search = '?view=companies&cq=acme&industry=Software&source=current&quote=1&kyc=1&from=2026-08-01&to=2026-08-21&cpage=3';
    const state = readDashboardState(search);
    expect(state.companies).toEqual({
      search: 'acme',
      industry: 'Software',
      source_priority: 'current',
      has_quote: true,
      has_kyc: true,
      activity_from: '2026-08-01',
      activity_to: '2026-08-21',
      page: 2,
      pageSize: 25,
    });
    expect(writeDashboardState(state)).toBe(
      'cq=acme&industry=Software&source=current&quote=1&kyc=1&from=2026-08-01&to=2026-08-21&cpage=3'
    );
  });

  it('keeps deal and contact searches and pages independently', () => {
    const state = readDashboardState('?view=deals&dq=renewal&dpage=4&ctq=alice&ctpage=2');
    expect(state).toEqual({
      view: 'deals',
      companies: { page: 0, pageSize: 25 },
      deals: { search: 'renewal', page: 3 },
      contacts: { search: 'alice', page: 1 },
    });
    expect(writeDashboardState(state)).toBe('view=deals&dq=renewal&dpage=4&ctq=alice&ctpage=2');
  });

  it('normalizes unknown views and malformed pages to safe defaults', () => {
    const state = readDashboardState('?view=unknown&cpage=-7&dpage=wat&ctpage=0');
    expect(state.view).toBe('companies');
    expect(state.companies.page).toBe(0);
    expect(state.deals.page).toBe(0);
    expect(state.contacts.page).toBe(0);
  });

  it('does not erase a deep-linked page before the row count loads', () => {
    expect(clampPage(3, undefined, 25)).toBe(3);
    expect(clampPage(3, 100, 25)).toBe(3);
    expect(clampPage(4, 100, 25)).toBe(3);
    expect(clampPage(2, 0, 25)).toBe(0);
  });
});
