import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../src/hooks/useWorkspaceArchive.ts', import.meta.url), 'utf8');

describe('workspace archive browser selection', () => {
  it('selects the newest browseable verified archive separately from active workflow state', () => {
    expect(source).toMatch(/const browsable = useQuery/);
    expect(source).toMatch(/\.in\('status',\s*\['verified', 'deletion_eligible', 'deleted'\]\)/);
    expect(source).toMatch(/return \{ latest, browsable,/);
  });
});
