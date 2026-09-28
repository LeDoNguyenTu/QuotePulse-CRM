import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
describe('campaign queue worker isolation', () => {
  it('renders from recipient snapshots and scopes campaign completion writes', () => {
    expect(source).toMatch(/row\.recipient_snapshot/);
    expect(source).toMatch(/query = query\.eq\('workspace_id', row\.workspace_id\)/);
    expect(source).toMatch(/query = query\.eq\('campaign_id', row\.campaign_id\)/);
    expect(source).toMatch(/isSuppressed\(admin, ownerId, row\.to_email\)/);
    expect(source).toMatch(/\.eq\('owner_id', userId\)\.eq\('email_normalized'/);
  });
});
