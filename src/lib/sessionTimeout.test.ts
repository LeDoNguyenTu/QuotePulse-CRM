import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SESSION_TIMEOUT_MINUTES,
  MAX_SESSION_TIMEOUT_MINUTES,
  MIN_SESSION_TIMEOUT_MINUTES,
  normalizeSessionTimeoutMinutes,
  parseSessionTimeoutDraft,
  sessionTimeoutMs,
} from './sessionTimeout';

describe('session timeout settings', () => {
  it('uses two hours when a stored value is missing or invalid', () => {
    expect(normalizeSessionTimeoutMinutes(undefined)).toBe(DEFAULT_SESSION_TIMEOUT_MINUTES);
    expect(normalizeSessionTimeoutMinutes(Number.NaN)).toBe(DEFAULT_SESSION_TIMEOUT_MINUTES);
    expect(normalizeSessionTimeoutMinutes(MIN_SESSION_TIMEOUT_MINUTES - 1)).toBe(
      DEFAULT_SESSION_TIMEOUT_MINUTES
    );
    expect(normalizeSessionTimeoutMinutes(MAX_SESSION_TIMEOUT_MINUTES + 1)).toBe(
      DEFAULT_SESSION_TIMEOUT_MINUTES
    );
  });

  it('uses null milliseconds when automatic sign-out is disabled', () => {
    expect(sessionTimeoutMs(0)).toBeNull();
  });

  it('accepts the inclusive configured range and converts it to milliseconds', () => {
    expect(sessionTimeoutMs(MIN_SESSION_TIMEOUT_MINUTES)).toBe(5 * 60 * 1000);
    expect(sessionTimeoutMs(MAX_SESSION_TIMEOUT_MINUTES)).toBe(7 * 24 * 60 * 60 * 1000);
    expect(sessionTimeoutMs(120)).toBe(2 * 60 * 60 * 1000);
  });

  it('rejects fractional timeout values', () => {
    expect(normalizeSessionTimeoutMinutes(30.5)).toBe(DEFAULT_SESSION_TIMEOUT_MINUTES);
  });

  it('keeps a cleared minutes field as an invalid draft instead of disabling sign-out', () => {
    expect(parseSessionTimeoutDraft('')).toBe('');
    expect(parseSessionTimeoutDraft('240')).toBe(240);
  });
});
