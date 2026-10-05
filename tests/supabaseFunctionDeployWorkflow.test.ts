import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(new URL('../.github/workflows/supabase.yml', import.meta.url), 'utf8');

describe('Supabase Edge Function deployment workflow', () => {
  it('deploys the CRM record export function used by the frontend', () => {
    const deploymentLoop = workflow.match(/for fn in ([^;]+); do/)?.[1]?.split(/\s+/) ?? [];
    expect(deploymentLoop).toContain('export-crm-records');
  });
});
