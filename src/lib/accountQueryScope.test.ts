import { describe, expect, it } from 'vitest';
import { accountQueryKey, hasAccountChanged } from './accountQueryScope';

describe('account query scope', () => {
  it('uses different cache keys for different signed-in users', () => {
    expect(accountQueryKey('owner-a', ['company-page', { page: 0 }])).not.toEqual(
      accountQueryKey('owner-b', ['company-page', { page: 0 }])
    );
  });

  it('clears private data for a sign-out or a different user', () => {
    expect(hasAccountChanged('owner-a', null)).toBe(true);
    expect(hasAccountChanged('owner-a', 'owner-b')).toBe(true);
    expect(hasAccountChanged('owner-a', 'owner-a')).toBe(false);
  });
});
