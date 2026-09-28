import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const patch = readFileSync(new URL('./@hiraokahypertools+pst-extractor+0.5.0-alpha.2.patch', import.meta.url), 'utf8');

describe('PST parser compatibility patch', () => {
  it('skips only the observed unsupported property signature', async () => {
    // The helper is intentionally exported by our patch so its fail-closed boundary is executable.
    // @ts-expect-error package internals do not publish TypeScript declarations
    const { shouldSkipUnsupportedProperty } = await import('../node_modules/@hiraokahypertools/pst-extractor/dist/PropertyContextUtil.js');
    const observed = new Error('property type 0x1014 is unknown');

    expect(shouldSkipUnsupportedProperty(0x0f47, 0x1014, observed)).toBe(true);
    expect(shouldSkipUnsupportedProperty(0x0f48, 0x1014, observed)).toBe(true);
    expect(shouldSkipUnsupportedProperty(0x0f49, 0x1014, observed)).toBe(true);
    expect(shouldSkipUnsupportedProperty(0x0f4a, 0x1014, observed)).toBe(true);
    expect(shouldSkipUnsupportedProperty(0x0f46, 0x1014, observed)).toBe(false);
    expect(shouldSkipUnsupportedProperty(0x0f4b, 0x1014, observed)).toBe(false);
    expect(shouldSkipUnsupportedProperty(0x0f47, 0x1015, observed)).toBe(false);
    expect(shouldSkipUnsupportedProperty(0x0f47, 0x1014, new Error('corrupt property'))).toBe(false);
    expect(patch).toMatch(/Every other parser\/property failure stays fatal/);
    expect(patch).toMatch(/throw new Error/);
  });
});
