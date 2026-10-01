import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  fileURLToPath(new URL('../src/styles/index.css', import.meta.url)),
  'utf8',
);

describe('compact workspace branding', () => {
  it('fits the complete square artwork instead of clipping it to a wide header slot', () => {
    const compactRule = css.match(/\.workspace-brand--compact\s*\{([^}]*)\}/)?.[1] ?? '';
    const compactImageRule = css.match(/\.workspace-brand__image--compact\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(compactRule).toContain('width: 4rem');
    expect(compactRule).toContain('height: 1.75rem');
    expect(compactRule).toContain('overflow: visible');
    expect(compactImageRule).toContain('max-width: 100%');
    expect(compactImageRule).toContain('max-height: 100%');
    expect(compactImageRule).toContain('object-fit: contain');
    expect(css).toContain('.workspace-brand:not(.workspace-brand--compact)');
  });
});
