import { describe, expect, it } from 'vitest';
import config from '../../vercel.json';

describe('Vercel security headers', () => {
  it('protects every route with the required browser security headers', () => {
    const rule = config.headers?.find((entry) => entry.source === '/(.*)');
    const headers = new Map(rule?.headers.map((header) => [header.key, header.value]));

    expect(headers.get('Content-Security-Policy')).toContain("default-src 'self'");
    expect(headers.get('X-Frame-Options')).toBe('DENY');
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(headers.get('Permissions-Policy')).toContain('camera=()');
    expect(headers.get('Strict-Transport-Security')).toContain('max-age=');
  });
});
