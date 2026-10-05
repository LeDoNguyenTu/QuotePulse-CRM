import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/styles/index.css', import.meta.url), 'utf8');

describe('CRM row action buttons', () => {
  it('renders lifecycle and edit/delete actions as compact bordered controls', () => {
    expect(css).toMatch(/\.crm-text-action\s*\{[^}]*border:/s);
    expect(css).toMatch(/\.crm-text-action\s*\{[^}]*background:/s);
    expect(css).toMatch(/\.crm-text-action\s*\{[^}]*padding:/s);
    expect(css).toMatch(/\.contact-lifecycle-actions button\s*\{[^}]*border:/s);
    expect(css).toMatch(/\.contact-lifecycle-actions button\s*\{[^}]*background:/s);
    expect(css).toMatch(/\.contact-lifecycle-actions button\s*\{[^}]*padding:/s);
  });
});
