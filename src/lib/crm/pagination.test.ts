import { describe, expect, it } from 'vitest';
import { CRM_PAGE_SIZE, crmPageCount, crmPageRange, normalizeCrmPage } from './pagination';

describe('CRM pagination', () => {
  it('builds zero-based inclusive Supabase ranges', () => {
    expect(CRM_PAGE_SIZE).toBe(25);
    expect(crmPageRange(1)).toEqual({ from: 0, to: 24 });
    expect(crmPageRange(3)).toEqual({ from: 50, to: 74 });
  });

  it('normalizes invalid page numbers', () => {
    expect(normalizeCrmPage(0)).toBe(1);
    expect(normalizeCrmPage(-4)).toBe(1);
    expect(normalizeCrmPage(2.9)).toBe(2);
    expect(normalizeCrmPage(Number.NaN)).toBe(1);
  });

  it('calculates at least one page for an empty result', () => {
    expect(crmPageCount(0)).toBe(1);
    expect(crmPageCount(25)).toBe(1);
    expect(crmPageCount(26)).toBe(2);
  });
});
