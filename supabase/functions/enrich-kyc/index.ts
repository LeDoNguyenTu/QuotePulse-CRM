// Edge Function: enrich-kyc
// Finds a company's website, LinkedIn page, public contacts and about text using
// a pluggable web-search API, then upserts a normalized profile into kyc_profiles.
import { handleOptions, json, errorResponse } from '../_shared/cors.ts';
import { getAdminClient, getUserId, getUserSettings } from '../_shared/supabaseAdmin.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';

interface KycContact {
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
}
interface KycData {
  website?: string;
  linkedin?: string;
  contacts: KycContact[];
  about?: string;
  address?: string;
  other_links: string[];
}

interface SearchResult {
  name: string;
  url: string;
  snippet: string;
}

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  const errors: string[] = [];
  try {
    await getUserId(req); // authz only; KYC data is shared
    const admin = getAdminClient();
    const { company_id } = (await req.json()) as { company_id?: string };
    if (!company_id) return errorResponse('company_id is required', 400);

    const { data: company, error: cErr } = await admin
      .from('companies')
      .select('id, name_clean, website')
      .eq('id', company_id)
      .single();
    if (cErr || !company) return errorResponse('Company not found', 404);

    const name = company.name_clean as string;
    const data: KycData = { contacts: [], other_links: [] };

    // 1) Web search (best-effort — skipped gracefully if no key configured).
    //    Two queries: general discovery + a LinkedIn-targeted one, so name-only
    //    companies (no known website) still get a website + LinkedIn page.
    let results: SearchResult[] = [];
    if (!Deno.env.get('SEARCH_API_KEY')) {
      errors.push(
        'SEARCH_API_KEY not set — skipping web search (KYC can only use an already-known website).'
      );
    } else {
      try {
        const [general, linkedin] = await Promise.all([
          webSearch(`${name} official website contact`),
          webSearch(`${name} LinkedIn company`),
        ]);
        results = [...general, ...linkedin];
      } catch (e) {
        errors.push(`search: ${e instanceof Error ? e.message : e}`);
      }
    }

    // 2) Classify results into website / linkedin / other links.
    for (const r of results) {
      const host = safeHost(r.url);
      if (!host) continue;
      if (host.includes('linkedin.com') && !data.linkedin) {
        data.linkedin = r.url;
      } else if (!data.website && looksLikeOfficialSite(host, name, company.website)) {
        data.website = r.url;
      } else if (data.other_links.length < 8) {
        data.other_links.push(r.url);
      }
    }
    if (!data.website && company.website) data.website = company.website;

    // 3) Scrape the homepage for emails / phones / about text (best-effort).
    if (data.website) {
      try {
        const scraped = await scrapeSite(data.website);
        data.about = scraped.about;
        data.address = scraped.address;
        for (const c of scraped.contacts) data.contacts.push(c);
      } catch (e) {
        errors.push(`scrape: ${e instanceof Error ? e.message : e}`);
      }
    }

    // 4) Upsert kyc_profiles.
    const { error: upErr } = await admin.from('kyc_profiles').upsert(
      {
        company_id,
        enriched_data: data,
        primary_website: data.website ?? null,
        linkedin_company_url: data.linkedin ?? null,
        other_links: data.other_links,
        last_enriched_at: new Date().toISOString(),
      },
      { onConflict: 'company_id' }
    );
    if (upErr) throw upErr;

    // 5) Persist discovered contacts (source = google) so the company becomes
    //    emailable. Errors now surface in the response instead of being swallowed.
    await saveContacts(admin, company_id, data, errors);

    return json({ ok: true, company_id, enriched_data: data, errors });
  } catch (e) {
    return json(
      { ok: false, errors: [...errors, e instanceof Error ? e.message : String(e)] },
      500
    );
  }
});

// ---------------------------------------------------------------------------

/**
 * Serper.dev — returns Google's organic search results. POST { q } with an
 * `X-API-KEY` header; the response has an `organic[]` array of
 * { title, link, snippet }. Override SEARCH_API_URL only if you proxy Serper.
 * To switch providers, adapt the request + the mapping below.
 * Rate limiting: one request per enrichment call (the UI gates per company).
 */
async function webSearch(query: string): Promise<SearchResult[]> {
  const key = Deno.env.get('SEARCH_API_KEY');
  if (!key) return [];
  const url = Deno.env.get('SEARCH_API_URL') ?? 'https://google.serper.dev/search';

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query, num: 10 }),
  });
  if (!res.ok) throw new Error(`search ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as {
    organic?: { title: string; link: string; snippet?: string }[];
  };
  return (body.organic ?? []).map((v) => ({
    name: v.title,
    url: v.link,
    snippet: v.snippet ?? '',
  }));
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const PHONE_RE = /(?:\+?\d[\d\s().-]{6,}\d)/g;

async function scrapeSite(website: string): Promise<{
  about?: string;
  address?: string;
  contacts: KycContact[];
}> {
  const res = await fetch(website, {
    headers: { 'User-Agent': 'Mozilla/5.0 (KYC enrichment bot)' },
    signal: AbortSignal.timeout(8000),
  });
  const html = await res.text();
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();

  const emails = [...new Set(text.match(EMAIL_RE) ?? [])].slice(0, 5);
  const phones = [...new Set(text.match(PHONE_RE) ?? [])]
    .map((p) => p.trim())
    .filter((p) => p.replace(/\D/g, '').length >= 8)
    .slice(0, 3);

  const contacts: KycContact[] = emails.map((email, i) => ({ email, phone: phones[i] }));
  if (contacts.length === 0 && phones.length) contacts.push({ phone: phones[0] });

  return { about: extractAbout(html, text), address: extractAddress(text), contacts };
}

// Navigation/menu boilerplate that commonly leaks into scraped page text.
const NAV_NOISE_RE =
  /\b(skip to (?:main )?content|hit enter to search or esc to close|close search|close menu|open menu|toggle navigation|back to top|read more|learn more)\b/gi;

/** Prefer a clean meta/OG description; fall back to de-noised visible text. */
function extractAbout(html: string, text: string): string | undefined {
  const og = html.match(
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i
  );
  const meta = html.match(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i
  );
  const raw = (og?.[1] ?? meta?.[1] ?? text)
    .replace(NAV_NOISE_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return raw ? raw.slice(0, 240).trim() : undefined;
}

/** Pull an address near an ADDRESS label, else a street/postal pattern; capped. */
function extractAddress(text: string): string | undefined {
  const labeled = text.match(
    /\bADDRESS\b[:\s]*([^]{5,120}?)(?=\b(?:TEL|TELEPHONE|PHONE|MOBILE|FAX|EMAIL|E-?MAIL)\b|$)/i
  );
  let addr = labeled?.[1];
  if (!addr) {
    const street = text.match(
      /\d{1,5}[\sA-Za-z0-9.,#\-]{3,80}?(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Drive|Dr|Blvd|Way|Building|Centre|Center|Tower|Singapore)\b[\sA-Za-z0-9.,#\-]{0,40}/i
    );
    addr = street?.[0];
  }
  addr = addr?.replace(/\s+/g, ' ').trim();
  if (!addr) return undefined;
  return addr.length > 120 ? `${addr.slice(0, 120).trim()}…` : addr;
}

async function saveContacts(
  admin: SupabaseClient,
  companyId: string,
  data: KycData,
  errors: string[]
) {
  for (const c of data.contacts) {
    if (!c.email && !c.phone) continue;
    // Dedupe by email. The contacts unique index is functional — (company_id,
    // lower(email)) — which the old onConflict:'company_id,email' target did NOT
    // match, so every upsert silently failed and no contact was ever saved.
    if (c.email) {
      const { data: existing } = await admin
        .from('contacts')
        .select('id')
        .eq('company_id', companyId)
        .ilike('email', c.email)
        .maybeSingle();
      if (existing) continue;
    }
    const { error } = await admin.from('contacts').insert({
      company_id: companyId,
      full_name: c.name ?? null,
      email: c.email ?? null,
      phone: c.phone ?? null,
      role_title: c.role ?? null,
      source: 'google',
    });
    // 23505 = unique violation (race / same email) — safe to ignore; surface the rest.
    if (error && error.code !== '23505') {
      errors.push(`save contact ${c.email ?? c.phone}: ${error.message}`);
    }
  }
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

const AGGREGATOR_RE =
  /(facebook|instagram|twitter|x\.com|youtube|wikipedia|yelp|indeed|linkedin|crunchbase|bloomberg|glassdoor|zoominfo|dnb\.com|yellowpages)/;

function looksLikeOfficialSite(
  host: string,
  name: string,
  knownWebsite: string | null
): boolean {
  // Never treat directories / social profiles as the official site.
  if (AGGREGATOR_RE.test(host)) return false;
  // Trust the host of a website we already know for this company.
  if (knownWebsite) {
    const known = safeHost(knownWebsite);
    if (known && host.includes(known)) return true;
  }
  // Otherwise require the host to contain one of the company's name tokens
  // (e.g. "3pa" → 3pa.sg) — no more "any short host wins" guessing.
  const tokens = name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .split(/\s+/)
    .filter((t) => t.length >= 3);
  return tokens.some((t) => host.includes(t));
}
