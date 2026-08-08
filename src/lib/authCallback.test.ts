import { describe, expect, it } from 'vitest';
import { authOtpType } from './authCallback';

describe('authOtpType', () => {
  it('preserves the email-change token type Supabase sends to the callback', () => {
    expect(authOtpType('email_change')).toBe('email_change');
  });

  it('uses signup for a missing or unsupported token type', () => {
    expect(authOtpType(null)).toBe('signup');
    expect(authOtpType('unexpected')).toBe('signup');
  });
});
