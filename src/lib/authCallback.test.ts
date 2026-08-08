import { describe, expect, it } from 'vitest';
import { authCallbackNoTokenState, authCallbackSessionState, authOtpType } from './authCallback';

describe('authOtpType', () => {
  it('preserves the email-change token type Supabase sends to the callback', () => {
    expect(authOtpType('email_change')).toBe('email_change');
  });

  it('uses signup for a missing or unsupported token type', () => {
    expect(authOtpType(null)).toBe('signup');
    expect(authOtpType('unexpected')).toBe('signup');
  });

  it('treats a no-session email-change redirect as a recorded confirmation', () => {
    expect(authCallbackNoTokenState('email-change')).toBe('email_change_pending');
    expect(authCallbackNoTokenState(null)).toBe('missing_token');
  });

  it('keeps an email change pending while Supabase reports a new email waiting for confirmation', () => {
    expect(authCallbackSessionState('email-change', 'new@example.com')).toBe('email_change_pending');
    expect(authCallbackSessionState('email-change', null)).toBe('verified');
  });
});
