import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/styles/index.css', import.meta.url), 'utf8');

describe('Campaign reporting visual hierarchy', () => {
  it('keeps the campaign and recipient ledgers out of the generic task-list columns', () => {
    expect(css).toMatch(/\.crm-task-list\s*>\s*\.crm-campaign-report\s*\{[^}]*display:\s*block/s);
    expect(css).toMatch(/\.crm-campaign-ledger\s*>\s*\.crm-campaign-ledger__row\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
  });

  it('gives expanded content the card width and safely wraps provider errors', () => {
    expect(css).toMatch(/\.crm-campaign-ledger__failure[\s\S]*overflow-wrap:\s*anywhere/s);
    expect(css).toMatch(/\.crm-email-content\s*\{[^}]*min-width:\s*0[^}]*width:\s*100%/s);
    expect(css).toMatch(/\.crm-email-content\s+pre\s*\{[^}]*white-space:\s*pre-wrap[^}]*overflow-wrap:\s*anywhere/s);
  });
});
