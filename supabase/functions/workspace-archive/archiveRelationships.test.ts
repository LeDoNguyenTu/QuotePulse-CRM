import { describe, expect, it } from 'vitest';
import { companyBloomMayContain, createCompanyBloom, findCompanyRelationships } from './archiveRelationships';

describe('archive company relationship Bloom metadata', () => {
  const companyA = '11111111-1111-4111-8111-111111111111';
  const companyB = '22222222-2222-4222-8222-222222222222';
  const unrelated = '99999999-9999-4999-8999-999999999999';
  const secret = 'relationship-index-test-secret';
  const context = { archiveId: 'archive-1', workspaceId: 'workspace-1', ownerId: 'owner-1', table: 'contacts', sequence: 2, checksum: 'a'.repeat(64) };

  it('deterministically includes every company represented by an archive object', async () => {
    const rows = [{ company_id: companyA }, { company_id: companyB }, { company_id: companyA }, { company_id: null }];
    const bloom = await createCompanyBloom(rows, secret, context);

    expect(bloom).toBe(await createCompanyBloom([...rows].reverse(), secret, context));
    expect(bloom.startsWith('v1:')).toBe(true);
    expect(await companyBloomMayContain(bloom, companyA, secret, context)).toBe(true);
    expect(await companyBloomMayContain(bloom, companyB, secret, context)).toBe(true);
    expect(await companyBloomMayContain(bloom, unrelated, secret, context)).toBe(false);
  });

  it('represents an object with no company relationships without treating it as unindexed', async () => {
    const bloom = await createCompanyBloom([{ company_id: null }, { id: 'row-2' }], secret, context);

    expect(bloom.startsWith('v1:')).toBe(true);
    expect(await companyBloomMayContain(bloom, companyA, secret, context)).toBe(false);
  });

  it('fails open for missing, malformed, future, corrupted, or misplaced Bloom metadata', async () => {
    const bloom = await createCompanyBloom([{ company_id: companyA }], secret, context);
    const corrupted = `${bloom.slice(0, 10)}${bloom[10] === 'A' ? 'B' : 'A'}${bloom.slice(11)}`;
    expect(await companyBloomMayContain(null, companyA, secret, context)).toBe(true);
    expect(await companyBloomMayContain('', companyA, secret, context)).toBe(true);
    expect(await companyBloomMayContain('v1:not-base64!', companyA, secret, context)).toBe(true);
    expect(await companyBloomMayContain('v2:AAAA', companyA, secret, context)).toBe(true);
    expect(await companyBloomMayContain(corrupted, unrelated, secret, context)).toBe(true);
    expect(await companyBloomMayContain(bloom, unrelated, secret, { ...context, sequence: 3 })).toBe(true);
  });

  it('returns only exact company matches with their source offsets', () => {
    const rows = [
      { id: 'contact-a', company_id: companyA },
      { id: 'contact-b', company_id: companyB },
      { id: 'contact-a2', company_id: companyA },
    ];

    expect(findCompanyRelationships(rows, companyA)).toEqual([
      { offset: 0, row: rows[0] },
      { offset: 2, row: rows[2] },
    ]);
  });
});
