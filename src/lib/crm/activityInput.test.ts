import { describe, expect, it } from 'vitest';
import { localDateTimeValue, normalizeActivityInput } from './activityInput';

describe('CRM activity input', () => {
  it('requires text and normalizes timestamps', () => {
    expect(localDateTimeValue(new Date(2026, 8, 28, 10, 30))).toBe('2026-09-28T10:30');
    expect(normalizeActivityInput({ kind: 'note', body: '  ', occurredAt: '', updateLastCall: false })).toEqual({ ok: false, error: 'Activity text is required.' });
    expect(normalizeActivityInput({ kind: 'call', body: ' Spoke with buyer ', occurredAt: '2026-09-28T10:30', updateLastCall: true })).toEqual({
      ok: true,
      value: { kind: 'call', body: 'Spoke with buyer', occurredAt: new Date('2026-09-28T10:30').toISOString(), updateLastCall: true },
    });
  });
});
