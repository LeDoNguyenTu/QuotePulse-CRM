import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/styles/index.css', import.meta.url), 'utf8');

function declarationsFor(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
}

function declarationsForMobile(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const mobile = css.slice(css.indexOf('@media (max-width: 767px)'));
  return mobile.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
}

describe('CRM filter bar responsive layout', () => {
  it('wraps fixed-width controls before they overflow a narrow content pane', () => {
    expect(declarationsFor('.crm-filter-bar')).toMatch(/flex-wrap:\s*wrap/);
    expect(declarationsFor('.crm-filter-bar__search')).toMatch(/flex:\s*1 1 16rem/);
  });

  it('does not let the search control grow into a blank vertical spacer on mobile', () => {
    expect(declarationsForMobile('.crm-filter-bar__search')).toMatch(/flex:\s*0 0 auto/);
  });
});
