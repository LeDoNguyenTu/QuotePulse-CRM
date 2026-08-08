import { describe, expect, it } from 'vitest';
import {
  classifyProviderFailure,
  isSuppressedEmail,
  normalizeEmail,
  scheduleRecipients,
} from './emailQueue';

describe('email queue rules', () => {
  it('spaces recipients using the selected cooldown', () => {
    const scheduled = scheduleRecipients(new Date('2026-08-08T00:00:00.000Z'), 3, 60);
    expect(scheduled.map((date) => date.toISOString())).toEqual([
      '2026-08-08T00:00:00.000Z',
      '2026-08-08T00:01:00.000Z',
      '2026-08-08T00:02:00.000Z',
    ]);
  });

  it('classifies throttling and temporary failures as retryable but recipient failures as permanent', () => {
    expect(classifyProviderFailure({ status: 429, retryAfterSeconds: 30 }).retryable).toBe(true);
    expect(classifyProviderFailure({ status: 503 }).retryable).toBe(true);
    expect(classifyProviderFailure({ status: 400 }).retryable).toBe(false);
  });

  it('normalizes suppressed addresses before matching', () => {
    expect(normalizeEmail('  PERSON@Example.COM ')).toBe('person@example.com');
    expect(isSuppressedEmail('PERSON@example.com', new Set(['person@example.com']))).toBe(true);
  });
});
