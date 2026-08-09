import { errorResponse, handleOptions, json } from '../_shared/cors.ts';
import {
  canonicalJobFingerprint,
  employerCareerSearchQuery,
  isExhaustiveJobProvider,
  normalizeAshbyJobs,
  normalizeEmployerSearchJobs,
  normalizeGreenhouseJobs,
  normalizeLeverJobs,
  normalizePortalSearchJobs,
  normalizeSmartRecruitersJobs,
  portalSearchQuery,
  shouldContinueSmartRecruitersPage,
  supportedProvider,
  type DiscoveredJob,
  type JobProvider,
  type PortalJobProvider,
  type PortalSearchResult,
} from '../_shared/jobSources.ts';
import { getAdminClient, getUserId } from '../_shared/supabaseAdmin.ts';

interface JobSourceConfig {
  id: string;
  provider: string;
  identifier: string;
  market: string;
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const userId = await getUserId(req);
    const { company_id } = await req.json() as { company_id?: string };
    if (!company_id) return errorResponse('company_id is required', 400);

    const admin = getAdminClient();
    const { data: company, error: companyError } = await admin
      .from('companies')
      .select('id')
      .eq('id', company_id)
      .eq('owner_id', userId)
      .maybeSingle();
    if (companyError || !company) return errorResponse('Company not found', 404);

    const { data: sourceRows, error: sourceError } = await admin
      .from('job_source_configs')
      .select('id, provider, identifier, market')
      .eq('owner_id', userId)
      .eq('company_id', company_id)
      .eq('enabled', true);
    if (sourceError) throw sourceError;

    const errors: string[] = [];
    let discovered = 0;
    let sourcesChecked = 0;
    for (const source of (sourceRows ?? []) as JobSourceConfig[]) {
      if (!supportedProvider(source.provider)) {
        errors.push(`${source.id}: unsupported provider`);
        continue;
      }
      sourcesChecked++;
      try {
        const jobs = await fetchJobs(
          source.provider,
          source.identifier,
          source.market || 'Singapore'
        );
        discovered += jobs.length;
        const seenAt = new Date().toISOString();

        if (jobs.length > 0) {
          const rows = jobs.map((job) => ({
            owner_id: userId,
            company_id,
            job_source_config_id: source.id,
            external_id: job.externalId,
            fingerprint: `${source.provider}:${source.identifier.toLowerCase()}:${job.externalId}`,
            canonical_fingerprint: canonicalJobFingerprint(job.title, job.location),
            title: job.title,
            location: job.location,
            department: job.department,
            workplace_type: job.workplaceType,
            apply_url: job.applyUrl,
            source_url: job.sourceUrl,
            posted_at: job.postedAt,
            description: job.description,
            is_open: true,
            last_seen_at: seenAt,
          }));
          const { error: jobError } = await admin
            .from('job_opportunities')
            .upsert(rows, { onConflict: 'owner_id,job_source_config_id,external_id' });
          if (jobError) throw jobError;
        }

        // Close only records absent from a successfully completed source scan.
        // Doing this after the upsert preserves the prior result set if a write fails.
        if (isExhaustiveJobProvider(source.provider)) {
          const { error: closeError } = await admin
            .from('job_opportunities')
            .update({ is_open: false })
            .eq('owner_id', userId)
            .eq('job_source_config_id', source.id)
            .lt('last_seen_at', seenAt);
          if (closeError) throw closeError;
        }

        const { error: sourceUpdateError } = await admin
          .from('job_source_configs')
          .update({ last_checked_at: new Date().toISOString() })
          .eq('id', source.id)
          .eq('owner_id', userId);
        if (sourceUpdateError) throw sourceUpdateError;
      } catch (error) {
        errors.push(`${source.provider}/${source.identifier}: ${message(error)}`);
      }
    }

    return json({ ok: errors.length === 0, sources_checked: sourcesChecked, discovered, errors });
  } catch (error) {
    return json({ ok: false, errors: [message(error)] }, 500);
  }
});

async function fetchJobs(
  provider: JobProvider,
  identifier: string,
  market: string
): Promise<DiscoveredJob[]> {
  if (provider === 'smartrecruiters') return fetchSmartRecruitersJobs(identifier);
  if (provider === 'career_page') return fetchEmployerCareerJobs(identifier, market);
  if (!isExhaustiveJobProvider(provider)) {
    return fetchPortalJobs(provider as PortalJobProvider, identifier, market);
  }

  const url = provider === 'greenhouse'
    ? `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(identifier)}/jobs?content=false`
    : provider === 'lever'
      ? `https://api.lever.co/v0/postings/${encodeURIComponent(identifier)}?mode=json`
      : `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(identifier)}`;
  const payload = await fetchJson(url);
  if (provider === 'greenhouse') return normalizeGreenhouseJobs(identifier, payload);
  if (provider === 'lever') return normalizeLeverJobs(identifier, payload);
  return normalizeAshbyJobs(identifier, payload);
}

async function fetchSmartRecruitersJobs(identifier: string): Promise<DiscoveredJob[]> {
  const records: unknown[] = [];
  const limit = 100;
  for (let offset = 0; ; offset += limit) {
    const list = asObject(await fetchJson(
      `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(identifier)}/postings?limit=${limit}&offset=${offset}`
    ));
    const content = Array.isArray(list.content) ? list.content : [];
    for (let start = 0; start < content.length; start += 10) {
      const details = await Promise.all(content.slice(start, start + 10).map(async (value) => {
        const row = asObject(value);
        if (typeof row.applyUrl === 'string') return row;
        const id = typeof row.id === 'string' || typeof row.id === 'number' ? String(row.id) : '';
        if (!id) return row;
        return fetchJson(
          `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(identifier)}/postings/${encodeURIComponent(id)}`
        );
      }));
      records.push(...details);
    }
    const total = typeof list.totalFound === 'number' ? list.totalFound : content.length;
    if (!shouldContinueSmartRecruitersPage(offset, content.length, total)) break;
  }
  return normalizeSmartRecruitersJobs(identifier, { content: records });
}

async function fetchEmployerCareerJobs(identifier: string, market: string): Promise<DiscoveredJob[]> {
  const results = await fetchSearchResults(employerCareerSearchQuery(identifier, market));
  return normalizeEmployerSearchJobs(identifier, results, market);
}

async function fetchPortalJobs(
  provider: PortalJobProvider,
  companyName: string,
  market: string
): Promise<DiscoveredJob[]> {
  const results = await fetchSearchResults(portalSearchQuery(provider, companyName, market));
  return normalizePortalSearchJobs(provider, results).map((job) => ({
    ...job,
    location: job.location ?? market,
  }));
}

async function fetchSearchResults(query: string): Promise<PortalSearchResult[]> {
  const key = Deno.env.get('SEARCH_API_KEY');
  if (!key) throw new Error('SEARCH_API_KEY is required for job discovery');
  const response = await fetch(Deno.env.get('SEARCH_API_URL') ?? 'https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query, num: 20, gl: 'sg', hl: 'en' }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`search returned HTTP ${response.status}`);
  const payload = asObject(await response.json());
  return (Array.isArray(payload.organic) ? payload.organic : []).map((value) => {
    const row = asObject(value);
    return {
      title: typeof row.title === 'string' ? row.title : '',
      url: typeof row.link === 'string' ? row.link : '',
      snippet: typeof row.snippet === 'string' ? row.snippet : '',
    };
  });
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'QuotePulse-CRM Job Intelligence' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`source returned HTTP ${response.status}`);
  return response.json();
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
