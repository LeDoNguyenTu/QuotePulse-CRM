import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  fileURLToPath(new URL('../src/styles/index.css', import.meta.url)),
  'utf8',
);

describe('compact workspace branding', () => {
  it('uses contained neutral database icons in full and compact layouts', () => {
    const compactRule = css.match(/\.workspace-brand--compact\s*\{([^}]*)\}/)?.[1] ?? '';
    const iconRule = css.match(/\.workspace-brand__icon\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(compactRule).toContain('width: 2.25rem');
    expect(compactRule).toContain('height: 2.25rem');
    expect(iconRule).toContain('width: 2.5rem');
    expect(css).toContain('.workspace-brand--legacy');
    expect(css).toContain('.workspace-brand--sales_crm');
    expect(css).not.toContain('.workspace-brand__image');
  });

  it('keeps the column picker above tables and inside narrow screens', () => {
    const panelRule = css.match(/\.column-selector__panel\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(panelRule).toContain('z-index: 60');
    expect(panelRule).toContain('max-width: calc(100vw - 2rem)');
    expect(css).toMatch(/@media \(max-width: 767px\)[\s\S]*\.column-selector__panel[\s\S]*left: 0/);
  });
});
