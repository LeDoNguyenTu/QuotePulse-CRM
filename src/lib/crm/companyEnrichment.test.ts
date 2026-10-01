import { describe, expect, it } from 'vitest';
import { classifyMissingIndustry, normalizeCompanyIds } from './companyEnrichment';

describe('classifyMissingIndustry', () => {
  it('classifies a blank industry from the company name', () => {
    expect(classifyMissingIndustry('SUNLEY M&E ENGINEERING', null)).toEqual({
      value: 'Engineering', source: 'classifier',
    });
  });

  it('never replaces a supplied workbook or user value', () => {
    expect(classifyMissingIndustry('SUNLEY M&E ENGINEERING', 'Construction')).toEqual({
      value: 'Construction', source: null,
    });
  });
});

describe('normalizeCompanyIds', () => {
  it('deduplicates valid IDs and caps enrichment requests at 25', () => {
    const ids = Array.from({ length: 27 }, (_, index) =>
      `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    );
    expect(normalizeCompanyIds([ids[0], ids[0], ...ids.slice(1)])).toEqual(ids.slice(0, 25));
  });

  it('rejects invalid IDs', () => {
    expect(() => normalizeCompanyIds(['not-an-id'])).toThrow(/valid company IDs/i);
  });
});
