import { describe, expect, it } from 'vitest';
import {
  normalizeAshbyJobs,
  normalizeGreenhouseJobs,
  normalizeLeverJobs,
  normalizePortalSearchJobs,
  normalizeSmartRecruitersJobs,
  canonicalJobFingerprint,
  employerCareerSearchQuery,
  isExhaustiveJobProvider,
  portalSearchQuery,
  publicCareerPageUrl,
  normalizeEmployerSearchJobs,
  shouldContinueSmartRecruitersPage,
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
    expect(supportedProvider('linkedin')).toBe(true);
  });

  it('normalises SmartRecruiters posting details into an official application', () => {
    expect(normalizeSmartRecruitersJobs('ExampleCo', {
      content: [{
        id: '74983486',
        name: 'Regional Sales Manager',
        applyUrl: 'https://jobs.smartrecruiters.com/ExampleCo/74983486-regional-sales-manager',
        releasedDate: '2026-08-01T08:00:00Z',
        location: { city: 'Singapore', country: 'SG', remote: false },
        department: { label: 'Sales' },
        typeOfEmployment: { label: 'Permanent' },
      }],
    })).toEqual([
      expect.objectContaining({
        externalId: '74983486',
        title: 'Regional Sales Manager',
        location: 'Singapore, SG',
        department: 'Sales',
        workplaceType: 'Permanent',
      }),
    ]);
  });

  it('normalises listed Ashby jobs and skips unlisted jobs', () => {
    expect(normalizeAshbyJobs('example', { jobs: [
      {
        title: 'Solutions Engineer',
        location: 'Singapore',
        department: 'Engineering',
        workplaceType: 'Hybrid',
        publishedAt: '2026-08-02T08:00:00Z',
        jobUrl: 'https://jobs.ashbyhq.com/example/job-1',
        applyUrl: 'https://jobs.ashbyhq.com/example/job-1/application',
        isListed: true,
      },
      {
        title: 'Confidential role',
        jobUrl: 'https://jobs.ashbyhq.com/example/job-2',
        applyUrl: 'https://jobs.ashbyhq.com/example/job-2/application',
        isListed: false,
      },
    ]})).toEqual([
      expect.objectContaining({
        externalId: 'job-1',
        title: 'Solutions Engineer',
        workplaceType: 'Hybrid',
      }),
    ]);
  });

  it('turns allowlisted search results into link-only Singapore jobs', () => {
    expect(normalizePortalSearchJobs('linkedin', [{
      title: 'Account Executive - Example Co | LinkedIn',
      url: 'https://www.linkedin.com/jobs/view/123',
      snippet: 'Hiring an Account Executive in Singapore.',
    }])).toEqual([
      expect.objectContaining({
        externalId: 'https://www.linkedin.com/jobs/view/123',
        title: 'Account Executive',
        location: 'Singapore',
      }),
    ]);
    expect(normalizePortalSearchJobs('linkedin', [{
      title: 'Fake',
      url: 'https://linkedin.com.evil.example/jobs/1',
      snippet: '',
    }])).toEqual([]);
  });

  it('builds Singapore portal searches and never treats search results as exhaustive', () => {
    expect(portalSearchQuery('mycareersfuture', 'Example Co', 'Singapore')).toBe(
      'site:mycareersfuture.gov.sg "Example Co" jobs "Singapore"'
    );
    expect(isExhaustiveJobProvider('greenhouse')).toBe(true);
    expect(isExhaustiveJobProvider('career_page')).toBe(false);
    expect(isExhaustiveJobProvider('linkedin')).toBe(false);
    expect(isExhaustiveJobProvider('jobstreet')).toBe(false);
    expect(supportedProvider('workday')).toBe(true);
    expect(portalSearchQuery('workday', 'Example Co', 'Singapore')).toContain('site:myworkdayjobs.com');
    expect(canonicalJobFingerprint('Account Executive', 'Singapore, SG')).toBe(
      canonicalJobFingerprint('Account Executive', 'Singapore')
    );
    expect(canonicalJobFingerprint('\u9500\u552e\u7ecf\u7406', 'Singapore')).not.toBe(
      canonicalJobFingerprint('\u5de5\u7a0b\u5e08', 'Singapore')
    );
  });

  it('discovers generic employer jobs through public search without crawling the source URL', () => {
    expect(employerCareerSearchQuery('https://careers.example.com/openings', 'Singapore')).toBe(
      'site:careers.example.com jobs "Singapore"'
    );
    expect(normalizeEmployerSearchJobs('https://careers.example.com/openings', [{
      title: 'Regional Manager | Example Careers',
      url: 'https://careers.example.com/jobs/regional-manager',
      snippet: 'Based in Singapore',
    }], 'Singapore')).toEqual([
      expect.objectContaining({ title: 'Regional Manager', location: 'Singapore' }),
    ]);
    expect(normalizeEmployerSearchJobs('https://careers.example.com/openings', [{
      title: 'Wrong host',
      url: 'https://jobs.example.net/role',
      snippet: '',
    }], 'Singapore')).toEqual([]);
  });

  it('continues SmartRecruiters pagination beyond 2,000 jobs until the reported total is reached', () => {
    expect(shouldContinueSmartRecruitersPage(2_000, 100, 2_250)).toBe(true);
    expect(shouldContinueSmartRecruitersPage(2_200, 50, 2_250)).toBe(false);
  });

  it('accepts only public HTTPS career pages', () => {
    expect(publicCareerPageUrl('https://careers.example.com/jobs')).toBe('https://careers.example.com/jobs');
    expect(() => publicCareerPageUrl('http://careers.example.com/jobs')).toThrow(/public HTTPS/i);
    expect(() => publicCareerPageUrl('https://127.0.0.1/jobs')).toThrow(/public HTTPS/i);
    expect(() => publicCareerPageUrl('https://169.254.169.254/latest/meta-data')).toThrow(/public HTTPS/i);
    expect(() => publicCareerPageUrl('https://[::1]/jobs')).toThrow(/public HTTPS/i);
    expect(() => publicCareerPageUrl('https://www.linkedin.com/jobs/view/1')).toThrow(/employer website/i);
    expect(() => publicCareerPageUrl('https://example.myworkdayjobs.com/jobs')).toThrow(/employer website/i);
  });
});
