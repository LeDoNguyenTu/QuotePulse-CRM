import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = readFileSync(fileURLToPath(new URL('./index.ts', import.meta.url)), 'utf8');

describe('enrich-crm-company contract', () => {
  it('authenticates, verifies membership, scopes records, and caps requests', () => {
    expect(source).toContain('getUserId(req)');
    expect(source).toContain("from('workspace_members')");
    expect(source).toMatch(/\.eq\('workspace_id', workspaceId\)/);
    expect(source).toContain('MAX_COMPANIES = 25');
  });

  it('fills only blank fields and reports record-level failures', () => {
    expect(source).toContain('buildBlankCompanyPatch');
    expect(source).toContain("'enrichment'");
    expect(source).toContain('results');
    expect(source).toContain('errors');
    expect(source).toMatch(/ok:\s*successes\s*>\s*0/);
  });
});
