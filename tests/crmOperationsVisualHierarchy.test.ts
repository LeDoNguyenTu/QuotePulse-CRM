import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/styles/index.css', import.meta.url), 'utf8');

describe('Operations visual hierarchy', () => {
  it('gives operation sections and nested cards distinct visible boundaries', () => {
    expect(css).toMatch(/\.crm-operations-section\s*\{[^}]*border-color:\s*#c7d2e0/s);
    expect(css).toMatch(/\.crm-operations-section\s+\.crm-operations-card[\s\S]*border-color:\s*#cbd6e4/s);
    expect(css).toMatch(/\[data-theme='dark'\]\s+\.crm-operations-section\s*\{[^}]*border-color:\s*#3b4f68/s);
  });
});
