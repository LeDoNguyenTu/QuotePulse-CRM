export type JobSourceAccess = 'direct' | 'link_only';

export type JobSourceProvider =
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

export interface JobSourceCandidate {
  provider: JobSourceProvider;
  identifier: string;
  label: string;
  source_url: string;
  access: JobSourceAccess;
}

const PORTALS: Array<{ provider: JobSourceProvider; domain: string; label: string }> = [
  { provider: 'linkedin', domain: 'linkedin.com', label: 'LinkedIn' },
  { provider: 'mycareersfuture', domain: 'mycareersfuture.gov.sg', label: 'MyCareersFuture' },
  { provider: 'jobstreet', domain: 'jobstreet.com', label: 'JobStreet' },
  { provider: 'indeed', domain: 'indeed.com', label: 'Indeed' },
  { provider: 'foundit', domain: 'foundit.sg', label: 'Foundit' },
  { provider: 'fastjobs', domain: 'fastjobs.sg', label: 'FastJobs' },
  { provider: 'glints', domain: 'glints.com', label: 'Glints' },
  { provider: 'careersgov', domain: 'careers.gov.sg', label: 'Careers@Gov' },
  { provider: 'workday', domain: 'myworkdayjobs.com', label: 'Workday' },
];

export function detectJobSourceCandidates(
  urls: string[],
  companyName: string,
  officialHost?: string | null
): JobSourceCandidate[] {
  const candidates: JobSourceCandidate[] = [];
  for (const raw of urls) {
    const url = httpsUrl(raw);
    if (!url) continue;
    url.hash = '';
    const host = url.hostname.toLowerCase();
    const segment = url.pathname.split('/').filter(Boolean)[0];

    if (segment && (host === 'boards.greenhouse.io' || host === 'job-boards.greenhouse.io')) {
      candidates.push(candidate('greenhouse', segment, 'Greenhouse', url, 'direct'));
      continue;
    }
    if (segment && host === 'jobs.lever.co') {
      candidates.push(candidate('lever', segment, 'Lever', url, 'direct'));
      continue;
    }
    if (segment && host === 'careers.smartrecruiters.com') {
      candidates.push(candidate('smartrecruiters', segment, 'SmartRecruiters', url, 'direct'));
      continue;
    }
    if (segment && host === 'jobs.ashbyhq.com') {
      candidates.push(candidate('ashby', segment, 'Ashby', url, 'direct'));
      continue;
    }

    const portal = PORTALS.find((entry) => isHost(host, entry.domain));
    if (portal && isPortalJobUrl(portal.provider, url)) {
      candidates.push(candidate(portal.provider, companyName.trim(), portal.label, url, 'link_only'));
      continue;
    }

    if (
      officialHost &&
      isHost(host, officialHost.toLowerCase().replace(/^www\./, '')) &&
      /\/(careers?|jobs?|vacancies|join-us|work-with-us)(?:\/|$)/i.test(url.pathname)
    ) {
      candidates.push({
        provider: 'career_page',
        identifier: url.toString(),
        label: `${companyName.trim()} careers`,
        source_url: url.toString(),
        access: 'link_only',
      });
    }
  }

  const seen = new Set<string>();
  return candidates.filter((entry) => {
    const key = `${entry.provider}:${entry.identifier.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function extractHttpsLinks(html: string, baseUrl: string): string[] {
  const links = new Set<string>();
  const re = /<a\b[^>]*href=["']([^"'#]+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    try {
      const url = new URL(match[1].trim(), baseUrl);
      if (url.protocol !== 'https:') continue;
      url.hash = '';
      links.add(url.toString());
    } catch {
      // Ignore malformed links from third-party pages.
    }
  }
  return [...links];
}

function candidate(
  provider: JobSourceProvider,
  identifier: string,
  label: string,
  url: URL,
  access: JobSourceAccess
): JobSourceCandidate {
  return { provider, identifier, label, source_url: url.toString(), access };
}

function isHost(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

function isPortalJobUrl(provider: JobSourceProvider, url: URL): boolean {
  if (provider === 'linkedin') return /\/jobs(?:\/|$)/i.test(url.pathname);
  return /(?:job|career|opportunit|vacanc)/i.test(`${url.pathname}${url.search}`);
}

function httpsUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}
