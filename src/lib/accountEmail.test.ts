import { describe, expect, it } from 'vitest';
import { prepareLoginEmailChange } from './accountEmail';

describe('prepareLoginEmailChange', () => {
  it('trims a valid new login email before it is sent to Auth', () => {
    expect(prepareLoginEmailChange('owner@example.com', '  new-owner@example.com  ')).toEqual({
      email: 'new-owner@example.com',
    });
  });

  it('rejects an unchanged or malformed login email', () => {
    expect(prepareLoginEmailChange('owner@example.com', 'OWNER@example.com')).toEqual({
      error: 'Enter a different email address.',
    });
    expect(prepareLoginEmailChange('owner@example.com', 'not-an-email')).toEqual({
      error: 'Enter a valid email address.',
    });
  });
});
