import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/styles/index.css', import.meta.url), 'utf8');

function declarationsFor(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
}

describe('CRM filter bar responsive layout', () => {
  it('wraps fixed-width controls before they overflow a narrow content pane', () => {
    expect(declarationsFor('.crm-filter-bar')).toMatch(/flex-wrap:\s*wrap/);
    expect(declarationsFor('.crm-filter-bar__search')).toMatch(/flex:\s*1 1 16rem/);
  });
});
