import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(new URL('./20261009215017_legacy_archive_company_bloom.sql', import.meta.url), 'utf8');

describe('legacy archive company relationship metadata migration', () => {
  it('adds a bounded, versioned Bloom value to archive-object metadata', () => {
    expect(sql).toMatch(/alter table public\.workspace_archive_objects[\s\S]*add column company_bloom text/i);
    expect(sql).toMatch(/company_bloom is null[\s\S]*company_bloom ~ '\^v1:/i);
    expect(sql).toMatch(/length\(company_bloom\) between 1000 and 2000/i);
  });

  it('keeps browser progress reads while denying browser mutation rights', () => {
    expect(sql).toMatch(/revoke all on table public\.workspace_archive_objects from anon, authenticated/i);
    expect(sql).toMatch(/grant select on table public\.workspace_archive_objects to authenticated/i);
    expect(sql).not.toMatch(/grant (insert|update|delete|all)[^;]+to authenticated/i);
    expect(sql).toMatch(/grant all on table public\.workspace_archive_objects to service_role/i);
  });
});
