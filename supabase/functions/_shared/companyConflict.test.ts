import { describe, expect, it, vi } from 'vitest';
import {
  exactCaseInsensitivePattern,
  planExistingCompany,
  recoverCompanyInsertConflict,
} from './companyConflict.ts';

describe('exactCaseInsensitivePattern', () => {
  it('anchors and escapes literal company-name pattern characters', () => {
    expect(exactCaseInsensitivePattern('Astar*')).toBe('^Astar\\*$');
    expect(exactCaseInsensitivePattern('A.B (SG)')).toBe('^A\\.B \\(SG\\)$');
  });
});

describe('recoverCompanyInsertConflict', () => {
  it('returns the company committed by a competing insert after 23505', async () => {
    const winner = { id: 'company-winner', deleted_at: null };
    const lookup = vi.fn().mockResolvedValue(winner);

    await expect(
      recoverCompanyInsertConflict({ code: '23505', message: 'duplicate key' }, lookup)
    ).resolves.toBe(winner);
    expect(lookup).toHaveBeenCalledOnce();
  });

  it('rethrows non-unique insert errors without doing a lookup', async () => {
    const original = { code: '42501', message: 'permission denied' };
    const lookup = vi.fn();

    await expect(recoverCompanyInsertConflict(original, lookup)).rejects.toBe(original);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('rethrows the original 23505 when no winning company can be found', async () => {
    const original = { code: '23505', message: 'duplicate key' };

    await expect(
      recoverCompanyInsertConflict(original, async () => null)
    ).rejects.toBe(original);
  });

  it('surfaces a follow-up lookup failure', async () => {
    const lookupError = new Error('lookup failed');

    await expect(
      recoverCompanyInsertConflict(
        { code: '23505', message: 'duplicate key' },
        async () => {
          throw lookupError;
        }
      )
    ).rejects.toBe(lookupError);
  });
});

describe('planExistingCompany', () => {
  const existing = {
    id: 'company-winner',
    industry: 'Existing industry',
    website: 'https://existing.example',
    hubspot_company_id: 'old-hubspot-id',
    deleted_at: null,
  };

  it('merges incoming fields onto the company that won the insert race', () => {
    expect(planExistingCompany(existing, {
      industry: null,
      website: 'https://new.example',
      hubspot_company_id: 'new-hubspot-id',
      hubspot_properties: { name: 'Astar*' },
      hubspot_properties_schema_version: 'schema-v2',
    })).toEqual({
      action: 'update',
      id: 'company-winner',
      fields: {
        industry: 'Existing industry',
        website: 'https://new.example',
        hubspot_company_id: 'new-hubspot-id',
        hubspot_properties: { name: 'Astar*' },
        hubspot_properties_schema_version: 'schema-v2',
      },
    });
  });

  it('preserves recycle-bin behavior for a recovered company', () => {
    expect(planExistingCompany(
      { ...existing, deleted_at: '2026-08-10T00:00:00Z' },
      { industry: null, website: null, hubspot_company_id: null }
    )).toEqual({ action: 'skip-trashed', id: 'company-winner' });
  });
});
