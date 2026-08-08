import { errorResponse, handleOptions, json } from '../_shared/cors.ts';
import {
  normalizeGreenhouseJobs,
  normalizeLeverJobs,
  supportedProvider,
  type DiscoveredJob,
  type JobProvider,
} from '../_shared/jobSources.ts';
import { getAdminClient, getUserId } from '../_shared/supabaseAdmin.ts';

interface JobSourceConfig {
  id: string;
  provider: string;
  identifier: string;
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
      .select('id, provider, identifier')
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
        const jobs = await fetchJobs(source.provider, source.identifier);
        discovered += jobs.length;
        const seenAt = new Date().toISOString();

        if (jobs.length > 0) {
          const rows = jobs.map((job) => ({
            owner_id: userId,
            company_id,
            job_source_config_id: source.id,
            external_id: job.externalId,
            fingerprint: `${source.provider}:${source.identifier.toLowerCase()}:${job.externalId}`,
            title: job.title,
            location: job.location,
            department: job.department,
            workplace_type: job.workplaceType,
            apply_url: job.applyUrl,
            source_url: job.sourceUrl,
            posted_at: job.postedAt,
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
        const { error: closeError } = await admin
          .from('job_opportunities')
          .update({ is_open: false })
          .eq('owner_id', userId)
          .eq('job_source_config_id', source.id)
          .lt('last_seen_at', seenAt);
        if (closeError) throw closeError;

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

async function fetchJobs(provider: JobProvider, identifier: string): Promise<DiscoveredJob[]> {
  const url = provider === 'greenhouse'
    ? `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(identifier)}/jobs?content=false`
    : `https://api.lever.co/v0/postings/${encodeURIComponent(identifier)}?mode=json`;
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'QuotePulse-CRM Job Intelligence' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`source returned HTTP ${response.status}`);
  const payload = await response.json();
  return provider === 'greenhouse'
    ? normalizeGreenhouseJobs(identifier, payload)
    : normalizeLeverJobs(identifier, payload);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
