import { describe, expect, it } from 'vitest';
import {
  normalizeGreenhouseJobs,
  normalizeLeverJobs,
  supportedProvider,
} from './jobSources';

describe('public ATS job adapters', () => {
  it('normalises a Greenhouse job into an official apply link', () => {
    expect(
      normalizeGreenhouseJobs('acme', {
        jobs: [
          {
            id: 42,
            title: 'Account Executive',
            updated_at: '2026-08-08T12:00:00Z',
            absolute_url: 'https://boards.greenhouse.io/acme/jobs/42',
            location: { name: 'Singapore' },
            departments: [{ name: 'Sales' }],
          },
        ],
      })
    ).toEqual([
      expect.objectContaining({
        externalId: '42',
        title: 'Account Executive',
        location: 'Singapore',
        department: 'Sales',
        applyUrl: 'https://boards.greenhouse.io/acme/jobs/42',
      }),
    ]);
  });

  it('normalises a Lever job and refuses unsupported sources', () => {
    expect(
      normalizeLeverJobs('acme', [
        {
          id: 'lever-9',
          text: 'Solutions Consultant',
          hostedUrl: 'https://jobs.lever.co/acme/lever-9',
          applyUrl: 'https://jobs.lever.co/acme/lever-9/apply',
          categories: { location: 'Singapore', team: 'Consulting', commitment: 'Full-time' },
          createdAt: 1_785_168_000_000,
        },
      ])
    ).toEqual([
      expect.objectContaining({
        externalId: 'lever-9',
        workplaceType: 'Full-time',
        applyUrl: 'https://jobs.lever.co/acme/lever-9/apply',
      }),
    ]);
    expect(supportedProvider('linkedin')).toBe(false);
  });
});
