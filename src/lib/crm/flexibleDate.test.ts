import { describe, expect, it } from 'vitest';
import { formatCrmDateForDisplay, parseCrmDate } from './flexibleDate';

describe('flexible CRM dates', () => {
  it('recognizes Excel serial dates and their time fractions', () => {
    expect(parseCrmDate('46293', '1900')).toMatchObject({
      kind: 'single',
      startIso: '2026-09-28T00:00:00.000Z',
      hasTime: false,
    });
    expect(formatCrmDateForDisplay('46293.415277777778', '1900')).toBe('28 Sep 2026, 9:58 am');
    expect(parseCrmDate('1', '1904')).toMatchObject({ startIso: '1904-01-02T00:00:00.000Z' });
  });

  it('strictly recognizes common user-written date and time formats', () => {
    expect(parseCrmDate('28/09/2026 9:58 am', '1900')).toMatchObject({
      startIso: '2026-09-28T09:58:00.000Z',
      hasTime: true,
    });
    expect(parseCrmDate('28 Sep 2026 14:05', '1900')).toMatchObject({
      startIso: '2026-09-28T14:05:00.000Z',
    });
    expect(parseCrmDate('September 28, 2026', '1900')).toMatchObject({
      startIso: '2026-09-28T00:00:00.000Z',
    });
    expect(parseCrmDate('9/10/26', '1900')).toMatchObject({
      startIso: '2026-10-09T00:00:00.000Z',
    });
  });

  it('recognizes ranges and collapses repeated dates from a worksheet cell', () => {
    expect(parseCrmDate('28 Sep 2026 to 30 Sep 2026', '1900')).toMatchObject({
      kind: 'range',
      startIso: '2026-09-28T00:00:00.000Z',
      endIso: '2026-09-30T00:00:00.000Z',
    });
    expect(formatCrmDateForDisplay('28 Sep 2026 to 30 Sep 2026', '1900')).toBe('28 Sep 2026 – 30 Sep 2026');
    expect(formatCrmDateForDisplay('28 Sep 2026 9:30 am to 30 Sep 2026', '1900')).toBe('28 Sep 2026, 9:30 am – 30 Sep 2026');
    expect(formatCrmDateForDisplay('2026-09-28 2026-09-28', '1900')).toBe('28 Sep 2026');
  });

  it('rejects impossible and unrecognized dates without changing their display text', () => {
    expect(parseCrmDate('30/2/26', '1900')).toMatchObject({ kind: 'invalid' });
    expect(parseCrmDate('late September-ish', '1900')).toMatchObject({ kind: 'invalid' });
    expect(formatCrmDateForDisplay('30/2/26', '1900')).toBe('30/2/26');
  });
});
