export async function credentialFingerprint(credential: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(credential));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function isMatchingFreshCache(cache: { credential_fingerprint: string; expires_at: string } | null, fingerprint: string, now = Date.now()) {
  return Boolean(cache && cache.credential_fingerprint === fingerprint && new Date(cache.expires_at).getTime() > now);
}
