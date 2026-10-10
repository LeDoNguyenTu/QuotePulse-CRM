import { handleOptions, json, errorResponse } from '../_shared/cors.ts';
import { getAdminClient, getUserId } from '../_shared/supabaseAdmin.ts';
import { classifyIndustry } from '../_shared/industry.ts';
import { recordProviderUsage } from '../_shared/providerTelemetry.ts';

export const MAX_COMPANIES = 25;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FIELDS = ['industry', 'website', 'domain', 'phone', 'address_line_1', 'city', 'country'] as const;
type Field = typeof FIELDS[number];
type Company = Record<Field, string | null> & {
  id: string;
  name: string;
  field_sources: Record<string, string> | null;
};

function clean(value: unknown, max = 500): string | null {
  const output = String(value ?? '').replace(/\s+/g, ' ').trim();
  return output ? output.slice(0, max) : null;
}

function domainFromWebsite(value: string | null): string | null {
  if (!value) return null;
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ''); } catch { return null; }
}

function buildBlankCompanyPatch(
  company: Company,
  enriched: Partial<Record<Field, string | null>>,
  sourceByField: Partial<Record<Field, 'classifier' | 'enrichment'>> = {},
) {
  const patch: Record<string, unknown> = {};
  const fieldSources = { ...(company.field_sources ?? {}) };
  for (const field of FIELDS) {
    const value = clean(enriched[field], field === 'address_line_1' ? 1000 : 500);
    if (value && !clean(company[field])) {
      patch[field] = value;
      fieldSources[field] = sourceByField[field] ?? 'enrichment';
    }
  }
  if (Object.keys(patch).length) patch.field_sources = fieldSources;
  return patch;
}

async function searchCompany(name: string): Promise<Partial<Record<Field, string | null>>> {
  const apiKey = Deno.env.get('SEARCH_API_KEY');
  if (!apiKey) return {};
  const endpoint = Deno.env.get('SEARCH_API_URL') || 'https://google.serper.dev/search';
  const request = (url: string, body: Record<string, unknown>) => fetch(url, {
    method: 'POST', headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(12000),
  });
  const [response, placesResponse] = await Promise.all([
    request(endpoint, { q: `${name} Singapore company`, num: 5 }),
    request('https://google.serper.dev/places', { q: `${name} Singapore`, num: 3 }),
  ]);
  if (!response.ok && !placesResponse.ok) throw new Error(`Public search returned HTTP ${response.status}/${placesResponse.status}.`);
  const payload = response.ok ? await response.json() as {
    knowledgeGraph?: { website?: string; type?: string; address?: string; phone?: string };
    organic?: Array<{ link?: string }>;
  } : {};
  const placesPayload = placesResponse.ok ? await placesResponse.json() as {
    places?: Array<{ website?: string; category?: string; address?: string; phoneNumber?: string }>;
  } : {};
  const graph = payload.knowledgeGraph ?? {};
  const place = placesPayload.places?.[0] ?? {};
  const website = clean(graph.website) ?? clean(place.website) ?? clean(payload.organic?.[0]?.link);
  const address = clean(graph.address, 1000) ?? clean(place.address, 1000);
  return {
    industry: clean(graph.type) ?? clean(place.category), website, domain: domainFromWebsite(website),
    phone: clean(graph.phone) ?? clean(place.phoneNumber), address_line_1: address,
    city: address && /singapore/i.test(address) ? 'Singapore' : null,
    country: address && /singapore/i.test(address) ? 'Singapore' : null,
  };
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  try {
    const userId = await getUserId(req);
    const body = await req.json() as Record<string, unknown>;
    const workspaceId = String(body.workspace_id ?? '');
    const rawIds = Array.isArray(body.company_ids) ? body.company_ids.map(String) : [];
    const companyIds = [...new Set(rawIds.map((value) => value.trim()).filter(Boolean))];
    if (!UUID.test(workspaceId)) return errorResponse('A valid workspace_id is required.', 400);
    if (!companyIds.length || companyIds.length > MAX_COMPANIES || companyIds.some((id) => !UUID.test(id))) {
      return errorResponse('Choose between 1 and 25 valid company IDs.', 400);
    }

    const admin = getAdminClient();
    const { data: membership, error: membershipError } = await admin.from('workspace_members')
      .select('workspace_id').eq('workspace_id', workspaceId).eq('user_id', userId).maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) return errorResponse('Workspace membership required.', 403);

    const { data, error } = await admin.from('crm_companies')
      .select('id,name,industry,website,domain,phone,address_line_1,city,country,field_sources')
      .eq('workspace_id', workspaceId).in('id', companyIds);
    if (error) throw error;
    const companies = (data ?? []) as Company[];
    const results: Array<{ company_id: string; updated_fields: string[] }> = [];
    const errors: Array<{ company_id: string; error: string }> = [];
    const warnings = Deno.env.get('SEARCH_API_KEY') ? [] : ['Public search is unavailable; name-based industry classification still ran.'];

    for (const company of companies) {
      try {
        const publicData = await searchCompany(company.name);
        if (Deno.env.get('SEARCH_API_KEY')) await recordProviderUsage(admin, { ownerId: userId, workspaceId, provider: 'serper', operation: 'company_enrichment', units: 2, succeeded: true });
        const classifiedIndustry = publicData.industry ? null : classifyIndustry(company.name);
        const patch = buildBlankCompanyPatch(company, {
          ...publicData,
          industry: publicData.industry ?? classifiedIndustry,
        }, classifiedIndustry ? { industry: 'classifier' } : {});
        const updatedFields = Object.keys(patch).filter((field) => field !== 'field_sources');
        if (updatedFields.length) {
          const { error: updateError } = await admin.from('crm_companies').update({
            ...patch, updated_by: userId,
          }).eq('workspace_id', workspaceId).eq('id', company.id);
          if (updateError) throw updateError;
        }
        results.push({ company_id: company.id, updated_fields: updatedFields });
      } catch (cause) {
        if (Deno.env.get('SEARCH_API_KEY')) await recordProviderUsage(admin, { ownerId: userId, workspaceId, provider: 'serper', operation: 'company_enrichment', units: 2, succeeded: false, errorCategory: 'provider_error' });
        errors.push({ company_id: company.id, error: cause instanceof Error ? cause.message : String(cause) });
      }
    }
    for (const missingId of companyIds.filter((id) => !companies.some((company) => company.id === id))) {
      errors.push({ company_id: missingId, error: 'Company was not found in this workspace.' });
    }
    const successes = results.length;
    return json({ ok: successes > 0, results, errors, warnings }, successes > 0 ? 200 : 422);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : String(error), 500);
  }
});
