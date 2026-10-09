import { describe, expect, it } from 'vitest';
import { companyBloomMayContain, createCompanyBloom, findCompanyRelationships } from './archiveRelationships';

describe('archive company relationship Bloom metadata', () => {
  const companyA = '11111111-1111-4111-8111-111111111111';
  const companyB = '22222222-2222-4222-8222-222222222222';
  const unrelated = '99999999-9999-4999-8999-999999999999';

  it('deterministically includes every company represented by an archive object', () => {
    const rows = [{ company_id: companyA }, { company_id: companyB }, { company_id: companyA }, { company_id: null }];
    const bloom = createCompanyBloom(rows);

    expect(bloom).toBe(createCompanyBloom([...rows].reverse()));
    expect(bloom.startsWith('v1:')).toBe(true);
    expect(companyBloomMayContain(bloom, companyA)).toBe(true);
    expect(companyBloomMayContain(bloom, companyB)).toBe(true);
    expect(companyBloomMayContain(bloom, unrelated)).toBe(false);
  });

  it('represents an object with no company relationships without treating it as unindexed', () => {
    const bloom = createCompanyBloom([{ company_id: null }, { id: 'row-2' }]);

    expect(bloom.startsWith('v1:')).toBe(true);
    expect(companyBloomMayContain(bloom, companyA)).toBe(false);
  });

  it('fails open for missing, malformed, or future Bloom metadata', () => {
    expect(companyBloomMayContain(null, companyA)).toBe(true);
    expect(companyBloomMayContain('', companyA)).toBe(true);
    expect(companyBloomMayContain('v1:not-base64!', companyA)).toBe(true);
    expect(companyBloomMayContain('v2:AAAA', companyA)).toBe(true);
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
