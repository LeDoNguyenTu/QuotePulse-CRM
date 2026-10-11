import { describe, expect, it } from 'vitest';
import { credentialFingerprint, isMatchingFreshCache } from './providerStatus';

describe('provider status cache identity', () => {
  it('reuses a fresh result only for the same credential fingerprint', async () => {
    const current = await credentialFingerprint('new-key');
    const old = await credentialFingerprint('old-key');
    const cache = { credential_fingerprint: old, expires_at: '2026-10-11T00:02:00.000Z' };
    expect(isMatchingFreshCache(cache, current, Date.parse('2026-10-11T00:01:00.000Z'))).toBe(false);
    expect(isMatchingFreshCache({ ...cache, credential_fingerprint: current }, current, Date.parse('2026-10-11T00:01:00.000Z'))).toBe(true);
  });
});
