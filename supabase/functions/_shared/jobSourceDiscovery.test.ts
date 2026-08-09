import { describe, expect, it } from 'vitest';
import { detectJobSourceCandidates, extractHttpsLinks } from './jobSourceDiscovery';

describe('job source candidate discovery', () => {
  it('detects public ATS identifiers from exact allowlisted hosts', () => {
    expect(detectJobSourceCandidates([
      'https://job-boards.greenhouse.io/example-co/jobs/123',
      'https://jobs.lever.co/example-co/abc',
      'https://careers.smartrecruiters.com/ExampleCo/sales-manager',
      'https://jobs.ashbyhq.com/example-co/42',
    ], 'Example Co', 'example.com')).toEqual([
      expect.objectContaining({ provider: 'greenhouse', identifier: 'example-co', access: 'direct' }),
      expect.objectContaining({ provider: 'lever', identifier: 'example-co', access: 'direct' }),
      expect.objectContaining({ provider: 'smartrecruiters', identifier: 'ExampleCo', access: 'direct' }),
      expect.objectContaining({ provider: 'ashby', identifier: 'example-co', access: 'direct' }),
    ]);
  });

  it('recognises Singapore portals as link-only without trusting lookalike hosts', () => {
    const candidates = detectJobSourceCandidates([
      'https://www.linkedin.com/jobs/view/123',
      'https://www.mycareersfuture.gov.sg/job/sales/abc',
      'https://sg.jobstreet.com/job/123',
      'https://sg.indeed.com/viewjob?jk=123',
      'https://www.foundit.sg/job/example-123',
      'https://www.fastjobs.sg/singapore-job-ad/123',
      'https://glints.com/sg/opportunities/jobs/example/123',
      'https://jobs.careers.gov.sg/jobs/hrp/123',
      'https://example.wd3.myworkdayjobs.com/en-US/careers/job/Singapore/Manager_JR-42',
      'https://www.linkedin.com/company/example-co',
      'https://linkedin.com.evil.example/jobs/view/999',
    ], 'Example Co', 'example.com');

    expect(candidates.map((candidate) => candidate.provider)).toEqual([
      'linkedin',
      'mycareersfuture',
      'jobstreet',
      'indeed',
      'foundit',
      'fastjobs',
      'glints',
      'careersgov',
      'workday',
    ]);
    expect(candidates.every((candidate) => candidate.access === 'link_only')).toBe(true);
    expect(detectJobSourceCandidates([
      'https://www.linkedin.com/company/example-co',
    ], 'Example Co', 'example.com')).toEqual([]);
  });

  it('resolves career links from official-site HTML and ignores non-web schemes', () => {
    expect(extractHttpsLinks(`
      <a href="/careers">Careers</a>
      <a href="https://jobs.lever.co/example">Open roles</a>
      <a href="mailto:jobs@example.com">Email</a>
    `, 'https://example.com/about')).toEqual([
      'https://example.com/careers',
      'https://jobs.lever.co/example',
    ]);
  });

  it('adds same-site career pages, rejects unsafe URLs, and deduplicates candidates', () => {
    expect(detectJobSourceCandidates([
      'https://example.com/careers',
      'https://example.com/careers#openings',
      'http://example.com/jobs',
      'javascript:alert(1)',
      'https://other.example/careers',
    ], 'Example Co', 'example.com')).toEqual([
      {
        provider: 'career_page',
        identifier: 'https://example.com/careers',
        label: 'Example Co careers',
        source_url: 'https://example.com/careers',
        access: 'link_only',
      },
    ]);
  });
});
