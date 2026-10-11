import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/styles/index.css', import.meta.url), 'utf8');

describe('Operations visual hierarchy', () => {
  it('gives operation sections and nested cards distinct visible boundaries', () => {
    expect(css).toMatch(/\.crm-operations-section\s*\{[^}]*border-color:\s*#c7d2e0/s);
    expect(css).toMatch(/\.crm-operations-section\s+\.crm-operations-card[\s\S]*border-color:\s*#cbd6e4/s);
    expect(css).toMatch(/\[data-theme='dark'\]\s+\.crm-operations-section\s*\{[^}]*border-color:\s*#3b4f68/s);
  });

  it('keeps operation cards and failure rows inset from every panel edge', () => {
    expect(css).toMatch(/\.crm-operations-section\s*>\s*\.crm-operations-grid\s*\{[^}]*padding:\s*1rem/s);
    expect(css).toMatch(/\.crm-operations-section\s*>\s*\.crm-task-list\s*\{[^}]*padding:\s*1rem/s);
    expect(css).toMatch(/\.crm-task-list\s+\.crm-operations-failure\s*\{[^}]*border:\s*1px solid #cbd6e4[^}]*padding:\s*1rem/s);
  });
});
