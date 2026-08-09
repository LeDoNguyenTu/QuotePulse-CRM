import type { JobOpportunity, JobSourceProvider } from './types';

export type SupportedJobSource = JobSourceProvider;

export const DIRECT_JOB_PROVIDERS: JobSourceProvider[] = [
  'greenhouse', 'lever', 'smartrecruiters', 'ashby', 'career_page',
];

export const LINK_ONLY_JOB_PROVIDERS: JobSourceProvider[] = [
  'linkedin', 'mycareersfuture', 'jobstreet', 'indeed', 'foundit',
  'fastjobs', 'glints', 'careersgov', 'workday',
];

const PROVIDER_LABELS: Record<JobSourceProvider, string> = {
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  smartrecruiters: 'SmartRecruiters',
  ashby: 'Ashby',
  career_page: 'Employer career page',
  linkedin: 'LinkedIn',
  mycareersfuture: 'MyCareersFuture',
  jobstreet: 'JobStreet',
  indeed: 'Indeed Singapore',
  foundit: 'Foundit',
  fastjobs: 'FastJobs',
  glints: 'Glints',
  careersgov: 'Careers@Gov',
  workday: 'Workday',
};

const SOURCE_IDENTIFIER_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;

export function isSupportedJobSource(value: string): value is SupportedJobSource {
  return value in PROVIDER_LABELS;
}

export function validSourceIdentifier(
  value: string,
  provider: JobSourceProvider = 'greenhouse'
): boolean {
  if (provider === 'career_page') {
    try {
      return new URL(value.trim()).protocol === 'https:';
    } catch {
      return false;
    }
  }
  if (LINK_ONLY_JOB_PROVIDERS.includes(provider)) {
    const cleaned = value.trim();
    return cleaned.length > 0 && cleaned.length <= 200 &&
      [...cleaned].every((character) => character.charCodeAt(0) > 31);
  }
  return SOURCE_IDENTIFIER_RE.test(value.trim());
}

export function jobFingerprint(
  provider: SupportedJobSource,
  identifier: string,
  externalId: string
): string {
  return `${provider}:${identifier.trim().toLowerCase()}:${externalId}`;
}

export function portalAccessNotice(portal: 'linkedin' | 'mycareersfuture'): string {
  return portal === 'linkedin'
    ? 'LinkedIn is link-only: results come from public search links; this CRM does not scrape or automate LinkedIn.'
    : 'MyCareersFuture is link-only: results come from public search links; this CRM does not crawl the portal.';
}

export function providerLabel(provider: JobSourceProvider): string {
  return PROVIDER_LABELS[provider];
}

export function isLinkOnlyProvider(provider: JobSourceProvider): boolean {
  return LINK_ONLY_JOB_PROVIDERS.includes(provider);
}

export interface GroupedJobOpportunity {
  key: string;
  primary: JobOpportunity;
  postings: JobOpportunity[];
}

export function groupJobOpportunities(jobs: JobOpportunity[]): GroupedJobOpportunity[] {
  const groups = new Map<string, JobOpportunity[]>();
  for (const job of jobs) {
    const key = job.canonical_fingerprint || canonicalJobFingerprint(job.title, job.location);
    groups.set(key, [...(groups.get(key) ?? []), job]);
  }
  return [...groups.entries()].map(([key, postings]) => ({ key, primary: postings[0], postings }));
}

export function canonicalJobFingerprint(title: string, location: string | null): string {
  const normalise = (value: string) => value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  const normalisedLocation = normalise(location ?? '');
  const market = /\bsingapore\b|\bsg\b/.test(normalisedLocation) ? 'singapore' : normalisedLocation;
  return `${normalise(title)}|${market}`;
}
