import { describe, expect, it } from 'vitest';
import { mergeKycEnrichment } from './kycMerge';

describe('KYC enrichment merge', () => {
  it('uses newly discovered data when the existing profile was not manually edited', () => {
    expect(mergeKycEnrichment(
      { address: 'Old address', contacts: [{ email: 'old@example.com' }] },
      { address: 'New address', contacts: [{ email: 'new@example.com' }], job_source_candidates: [{ provider: 'lever' }] },
      false
    )).toEqual({
      address: 'New address',
      contacts: [{ email: 'new@example.com' }],
      job_source_candidates: [{ provider: 'lever' }],
    });
  });

  it('preserves manual fields while refreshing discovered job candidates', () => {
    expect(mergeKycEnrichment(
      {
        address: 'Corrected address',
        about: 'Corrected description',
        contacts: [{ email: 'manual@example.com' }],
        other_links: ['https://manual.example/link'],
        job_source_candidates: [{ provider: 'greenhouse' }],
      },
      {
        address: 'Search address',
        about: 'Search description',
        contacts: [{ email: 'search@example.com' }],
        other_links: ['https://search.example/link'],
        job_source_candidates: [{ provider: 'workday' }],
      },
      true
    )).toEqual(expect.objectContaining({
      address: 'Corrected address',
      about: 'Corrected description',
      contacts: [{ email: 'manual@example.com' }],
      other_links: ['https://manual.example/link'],
      job_source_candidates: [{ provider: 'workday' }],
    }));
  });

  it('preserves fields and contacts that a user intentionally cleared', () => {
    expect(mergeKycEnrichment(
      { website: '', address: '', contacts: [], manual_override_updated_at: '2026-08-10T00:00:00Z' },
      { website: 'https://search.example', address: 'Search address', contacts: [{ email: 'found@example.com' }] },
      true
    )).toEqual(expect.objectContaining({ website: '', address: '', contacts: [] }));
  });
});
