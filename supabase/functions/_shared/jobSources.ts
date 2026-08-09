export type JobProvider =
  | 'greenhouse'
  | 'lever'
  | 'smartrecruiters'
  | 'ashby'
  | 'career_page'
  | 'linkedin'
  | 'mycareersfuture'
  | 'jobstreet'
  | 'indeed'
  | 'foundit'
  | 'fastjobs'
  | 'glints'
  | 'careersgov'
  | 'workday';

export type PortalJobProvider = Extract<
  JobProvider,
  'linkedin' | 'mycareersfuture' | 'jobstreet' | 'indeed' | 'foundit' | 'fastjobs' | 'glints' | 'careersgov' | 'workday'
>;

export interface DiscoveredJob {
  externalId: string;
  title: string;
  location: string | null;
  department: string | null;
  workplaceType: string | null;
  applyUrl: string;
  sourceUrl: string | null;
  postedAt: string | null;
  description: string | null;
}

export function supportedProvider(value: string): value is JobProvider {
  return [
    'greenhouse', 'lever', 'smartrecruiters', 'ashby', 'career_page',
    'linkedin', 'mycareersfuture', 'jobstreet', 'indeed', 'foundit',
    'fastjobs', 'glints', 'careersgov', 'workday',
  ].includes(value);
}

export function normalizeGreenhouseJobs(_identifier: string, payload: unknown): DiscoveredJob[] {
  const jobs = object(payload).jobs;
  if (!Array.isArray(jobs)) return [];

  return jobs.flatMap((value) => {
    const job = object(value);
    const externalId = text(job.id);
    const title = text(job.title);
    const applyUrl = safeHttpsUrl(text(job.absolute_url));
    if (!externalId || !title || !applyUrl) return [];
    const location = text(object(job.location).name) ?? null;
    const department = firstName(job.departments);
    const postedAt = isoDate(text(job.updated_at));
    return [{
      externalId,
      title,
      location,
      department,
      workplaceType: null,
      applyUrl,
      sourceUrl: applyUrl,
      postedAt,
      description: null,
    }];
  });
}

export function normalizeLeverJobs(_identifier: string, payload: unknown): DiscoveredJob[] {
  if (!Array.isArray(payload)) return [];

  return payload.flatMap((value) => {
    const job = object(value);
    const externalId = text(job.id);
    const title = text(job.text);
    const applyUrl = safeHttpsUrl(text(job.applyUrl)) ?? safeHttpsUrl(text(job.hostedUrl));
    if (!externalId || !title || !applyUrl) return [];
    const categories = object(job.categories);
    const hostedUrl = safeHttpsUrl(text(job.hostedUrl));
    return [{
      externalId,
      title,
      location: text(categories.location) ?? null,
      department: text(categories.team) ?? null,
      workplaceType: text(categories.commitment) ?? null,
      applyUrl,
      sourceUrl: hostedUrl ?? applyUrl,
      postedAt: epochDate(job.createdAt),
      description: null,
    }];
  });
}

export function normalizeSmartRecruitersJobs(_identifier: string, payload: unknown): DiscoveredJob[] {
  const content = object(payload).content;
  if (!Array.isArray(content)) return [];
  return content.flatMap((value) => {
    const job = object(value);
    const externalId = text(job.id) ?? text(job.uuid);
    const title = text(job.name);
    const applyUrl = safeHttpsUrl(text(job.applyUrl));
    if (!externalId || !title || !applyUrl) return [];
    const location = object(job.location);
    return [{
      externalId,
      title,
      location: joinText([location.city, location.region, location.country]),
      department: text(object(job.department).label) ?? null,
      workplaceType: text(object(job.typeOfEmployment).label) ?? (location.remote === true ? 'Remote' : null),
      applyUrl,
      sourceUrl: applyUrl,
      postedAt: isoDate(text(job.releasedDate)),
      description: null,
    }];
  });
}

export function normalizeAshbyJobs(_identifier: string, payload: unknown): DiscoveredJob[] {
  const jobs = object(payload).jobs;
  if (!Array.isArray(jobs)) return [];
  return jobs.flatMap((value) => {
    const job = object(value);
    if (job.isListed === false) return [];
    const title = text(job.title);
    const applyUrl = safeHttpsUrl(text(job.applyUrl));
    const sourceUrl = safeHttpsUrl(text(job.jobUrl));
    const externalId = urlId(sourceUrl ?? applyUrl);
    if (!externalId || !title || !applyUrl) return [];
    return [{
      externalId,
      title,
      location: text(job.location) ?? null,
      department: text(job.department) ?? text(job.team) ?? null,
      workplaceType: text(job.workplaceType) ?? text(job.employmentType) ?? null,
      applyUrl,
      sourceUrl: sourceUrl ?? applyUrl,
      postedAt: isoDate(text(job.publishedAt)),
      description: text(job.descriptionPlain) ?? null,
    }];
  });
}

export interface PortalSearchResult {
  title: string;
  url: string;
  snippet: string;
}

const PORTAL_DOMAINS: Record<PortalJobProvider, string> = {
  linkedin: 'linkedin.com',
  mycareersfuture: 'mycareersfuture.gov.sg',
  jobstreet: 'jobstreet.com',
  indeed: 'indeed.com',
  foundit: 'foundit.sg',
  fastjobs: 'fastjobs.sg',
  glints: 'glints.com',
  careersgov: 'careers.gov.sg',
  workday: 'myworkdayjobs.com',
};

export function isExhaustiveJobProvider(provider: JobProvider): boolean {
  return provider !== 'career_page' && !(provider in PORTAL_DOMAINS);
}

export function portalSearchQuery(
  provider: PortalJobProvider,
  companyName: string,
  market: string
): string {
  const quoted = (value: string) => value.replace(/["\\]/g, ' ').replace(/\s+/g, ' ').trim();
  return `site:${PORTAL_DOMAINS[provider]} "${quoted(companyName)}" jobs "${quoted(market)}"`;
}

export function employerCareerSearchQuery(identifier: string, market: string): string {
  const url = new URL(publicCareerPageUrl(identifier));
  const cleanedMarket = market.replace(/["\\]/g, ' ').replace(/\s+/g, ' ').trim();
  return `site:${url.hostname.toLowerCase()} jobs "${cleanedMarket}"`;
}

export function normalizeEmployerSearchJobs(
  identifier: string,
  results: PortalSearchResult[],
  market: string
): DiscoveredJob[] {
  const host = new URL(publicCareerPageUrl(identifier)).hostname.toLowerCase();
  return results.flatMap((result) => {
    const applyUrl = safeHttpsUrl(result.url);
    if (!applyUrl || !hostMatches(applyUrl, host)) return [];
    const rawTitle = text(result.title);
    if (!rawTitle) return [];
    const title = rawTitle.replace(/\s*\|\s*[^|]+$/, '').trim();
    if (!title) return [];
    return [{
      externalId: applyUrl,
      title,
      location: /\bsingapore\b/i.test(`${result.title} ${result.snippet}`) ? 'Singapore' : market,
      department: null,
      workplaceType: /\bremote\b/i.test(`${result.title} ${result.snippet}`) ? 'Remote' : null,
      applyUrl,
      sourceUrl: applyUrl,
      postedAt: null,
      description: text(result.snippet) ?? null,
    }];
  });
}

export function shouldContinueSmartRecruitersPage(
  offset: number,
  count: number,
  total: number
): boolean {
  return count > 0 && offset + count < total;
}

export function publicCareerPageUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('career page must use a public HTTPS URL');
  }
  const host = url.hostname.toLowerCase();
  const unsafeHost =
    host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
    host.includes(':') || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host);
  if (url.protocol !== 'https:' || url.username || url.password || unsafeHost) {
    throw new Error('career page must use a public HTTPS URL');
  }
  if (Object.values(PORTAL_DOMAINS).some((domain) => host === domain || host.endsWith(`.${domain}`))) {
    throw new Error('career page must be an employer website, not a link-only job portal');
  }
  return url.toString();
}

export function normalizePortalSearchJobs(
  provider: PortalJobProvider,
  results: PortalSearchResult[]
): DiscoveredJob[] {
  const domain = PORTAL_DOMAINS[provider];
  return results.flatMap((result) => {
    const applyUrl = safeHttpsUrl(result.url);
    if (!applyUrl || !hostMatches(applyUrl, domain)) return [];
    const rawTitle = text(result.title);
    if (!rawTitle) return [];
    const title = rawTitle.replace(/\s*\|\s*[^|]+$/, '').split(/\s+-\s+/)[0].trim();
    if (!title) return [];
    const combined = `${result.title} ${result.snippet}`;
    return [{
      externalId: applyUrl,
      title,
      location: /\bsingapore\b/i.test(combined) ? 'Singapore' : null,
      department: null,
      workplaceType: /\bremote\b/i.test(combined) ? 'Remote' : null,
      applyUrl,
      sourceUrl: applyUrl,
      postedAt: null,
      description: text(result.snippet) ?? null,
    }];
  });
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

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function text(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const cleaned = String(value).replace(/\s+/g, ' ').trim();
  return cleaned ? cleaned.slice(0, 2_000) : null;
}

function firstName(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  return text(object(value[0]).name);
}

function joinText(values: unknown[]): string | null {
  const parts = values.map(text).filter((value): value is string => !!value);
  return parts.length ? parts.join(', ') : null;
}

function urlId(value: string | null): string | null {
  if (!value) return null;
  try {
    const parts = new URL(value).pathname.split('/').filter(Boolean);
    return parts.at(-1) ?? value;
  } catch {
    return null;
  }
}

function hostMatches(url: string, domain: string): boolean {
  const host = new URL(url).hostname.toLowerCase();
  return host === domain || host.endsWith(`.${domain}`);
}

function safeHttpsUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function isoDate(value: string | null): string | null {
  if (!value || Number.isNaN(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function epochDate(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
