import { describe, expect, it } from 'vitest';
import {
  groupJobOpportunities,
  portalAccessNotice,
  providerLabel,
  isSupportedJobSource,
  jobFingerprint,
  validSourceIdentifier,
} from './jobIntelligence';
import type { JobOpportunity } from './types';

describe('Job Intelligence helpers', () => {
  it('allows only supported public ATS connectors with safe identifiers', () => {
    expect(isSupportedJobSource('greenhouse')).toBe(true);
    expect(isSupportedJobSource('lever')).toBe(true);
    expect(isSupportedJobSource('smartrecruiters')).toBe(true);
    expect(isSupportedJobSource('ashby')).toBe(true);
    expect(isSupportedJobSource('linkedin')).toBe(true);
    expect(validSourceIdentifier('acme-careers')).toBe(true);
    expect(validSourceIdentifier('../private-board')).toBe(false);
    expect(validSourceIdentifier('https://example.com/careers', 'career_page')).toBe(true);
    expect(validSourceIdentifier('http://example.com/careers', 'career_page')).toBe(false);
  });

  it('generates a stable fingerprint for a discovered vacancy', () => {
    expect(jobFingerprint('greenhouse', 'acme-careers', '381')).toBe(
      'greenhouse:acme-careers:381'
    );
  });

  it('marks LinkedIn and MyCareersFuture as manual or authorisation-required', () => {
    expect(portalAccessNotice('linkedin')).toMatch(/link-only/i);
    expect(portalAccessNotice('mycareersfuture')).toMatch(/link-only/i);
    expect(providerLabel('careersgov')).toBe('Careers@Gov');
    expect(providerLabel('workday')).toBe('Workday');
  });

  it('groups the same role across official and portal sources without losing links', () => {
    const base = {
      id: 'job-1',
      owner_id: 'owner',
      company_id: 'company',
      job_source_config_id: 'source-1',
      external_id: 'external-1',
      fingerprint: 'greenhouse:example:external-1',
      canonical_fingerprint: 'account executive|singapore',
      title: 'Account Executive',
      location: 'Singapore',
      department: 'Sales',
      workplace_type: 'Full-time',
      description: null,
      apply_url: 'https://example.com/jobs/1',
      source_url: 'https://example.com/jobs/1',
      posted_at: '2026-08-01T00:00:00.000Z',
      is_open: true,
      last_seen_at: '2026-08-10T00:00:00.000Z',
      created_at: '2026-08-10T00:00:00.000Z',
      updated_at: '2026-08-10T00:00:00.000Z',
    } satisfies JobOpportunity;
    const grouped = groupJobOpportunities([
      base,
      {
        ...base,
        id: 'job-2',
        job_source_config_id: 'source-2',
        external_id: 'external-2',
        fingerprint: 'linkedin:example:external-2',
        apply_url: 'https://www.linkedin.com/jobs/view/2',
      },
    ]);

    expect(grouped).toHaveLength(1);
    expect(grouped[0].postings.map((job) => job.apply_url)).toEqual([
      'https://example.com/jobs/1',
      'https://www.linkedin.com/jobs/view/2',
    ]);
    expect(groupJobOpportunities([
      { ...base, id: 'zh-1', canonical_fingerprint: '', title: '\u9500\u552e\u7ecf\u7406' },
      { ...base, id: 'zh-2', canonical_fingerprint: '', title: '\u5de5\u7a0b\u5e08' },
    ])).toHaveLength(2);
  });
});
