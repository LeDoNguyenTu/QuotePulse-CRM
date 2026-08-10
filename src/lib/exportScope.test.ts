import { describe, expect, it } from 'vitest';
import { exportDateRange, validateExportScope } from './exportScope';

describe('export scope', () => {
  it('requires both activity dates', () => {
    expect(validateExportScope({ mode: 'hubspot_activity_range', from: '2026-08-01', to: '' }).error)
      .toBe('Choose both a start and end date.');
  });

  it('uses an exclusive following day for inclusive date ranges', () => {
    expect(exportDateRange({ mode: 'hubspot_activity_range', from: '2026-08-01', to: '2026-08-31' }))
      .toEqual({ from: '2026-08-01T00:00:00.000Z', toExclusive: '2026-09-01T00:00:00.000Z' });
  });
});
