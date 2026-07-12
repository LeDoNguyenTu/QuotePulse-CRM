// Edge Function: enrich-kyc
//
// Builds a company KYC profile the way a person actually researches a client:
// Google the name, read the knowledge panel and the Maps listing, open the
// official site, click through to Contact / About / Team, and note the LinkedIn
// and Facebook pages. No LLM — the quality comes from reading STRUCTURED data
// that the previous version ignored entirely:
//
//   * Serper `knowledgeGraph`  — website, phone, address, type, socials
//   * Serper `/places`         — Google Maps: street address + phone + website
//   * JSON-LD (schema.org)     — Organization / LocalBusiness / Person: email,
//                                telephone, PostalAddress, sameAs, description
//   * <a href="mailto:"> / <a href="tel:"> — far more reliable than regex over
//                                flattened text, and the heading beside them is
//                                usually the person's NAME (which the old
//                                "zip emails to phones" approach could never
//                                produce).
//
// Free-text regex is kept only as a last resort — it is what produced the
// "messy" output before. Every field records where it came from, in
// enriched_data.sources, so a wrong value is easy to spot and correct in the
// KYC editor.
import { handleOptions, json, errorResponse } from '../_shared/cors.ts';
import { getAdminClient, getUserId } from '../_shared/supabaseAdmin.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';

// --- types -----------------------------------------------------------------

interface KycContact {
  name?: string;
  role?: string;
  email?: string;
  phone?: string;
  source_url?: string;
}

interface FieldSource {
  field: string;
  value: string;
  url: string;
}

interface KycData {
  website?: string;
  linkedin?: string;
  facebook?: string;
  phone?: string;
  address?: string;
  about?: string;
  industry?: string;
  contacts: KycContact[];
  other_links: string[];
  sources: FieldSource[];
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface KnowledgeGraph {
  title?: string;
  type?: string;
  website?: string;
  description?: string;
  attributes?: Record<string, string>;
}

interface PlaceResult {
  title?: string;
  address?: string;
  phoneNumber?: string;
  website?: string;
  category?: string;
}

const PAGE_TIMEOUT_MS = 8000;
const MAX_PAGE_BYTES = 1_500_000;
const MAX_SUBPAGES = 3;

// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  const errors: string[] = [];
  try {
    const userId = await getUserId(req);
    const admin = getAdminClient();
    const { company_id } = (await req.json()) as { company_id?: string };
    if (!company_id) return errorResponse('company_id is required', 400);

    // Service role bypasses RLS — scope to the caller.
    const { data: company, error: cErr } = await admin
      .from('companies')
      .select('id, name_clean, website, industry')
      .eq('id', company_id)
      .eq('owner_id', userId)
      .maybeSingle();
    if (cErr || !company) return errorResponse('Company not found', 404);

    const name = company.name_clean as string;
    const data: KycData = { contacts: [], other_links: [], sources: [] };

    // ---- Stage 1: discover, from the NAME alone ---------------------------
    let organic: SearchResult[] = [];
    let kg: KnowledgeGraph | null = null;
    let places: PlaceResult[] = [];

    if (!Deno.env.get('SEARCH_API_KEY')) {
      errors.push(
        'SEARCH_API_KEY (Serper.dev) is not set, so KYC cannot search Google by company name — ' +
          'it can only scrape a website already recorded on the company. Set it with: ' +
          'supabase secrets set SEARCH_API_KEY=<your serper.dev key>'
      );
    } else {
      const [general, contactQ, linkedinQ, placeRes] = await Promise.all([
        serperSearch(`"${name}"`).catch((e) => {
          errors.push(`search: ${msg(e)}`);
          return { organic: [], knowledgeGraph: null };
        }),
        serperSearch(`${name} contact email phone address`).catch(() => ({
          organic: [],
          knowledgeGraph: null,
        })),
        serperSearch(`${name} site:linkedin.com/company`).catch(() => ({
          organic: [],
          knowledgeGraph: null,
        })),
        serperPlaces(name).catch(() => [] as PlaceResult[]),
      ]);

      organic = [...general.organic, ...contactQ.organic, ...linkedinQ.organic];
      kg = general.knowledgeGraph ?? contactQ.knowledgeGraph;
      places = placeRes;
    }

    // ---- Stage 2: classify the links --------------------------------------
    const place = pickPlace(places, name);

    for (const r of organic) {
      const host = safeHost(r.url);
      if (!host) continue;

      if (host.includes('linkedin.com') && /\/company\//i.test(r.url) && !data.linkedin) {
        data.linkedin = r.url;
        note(data, 'linkedin', r.url, r.url);
        // LinkedIn sits behind a login wall, but Google's snippet for it usually
        // carries the industry and a one-line description — free signal that the
        // old code fetched and then threw away.
        if (!data.about && r.snippet) {
          data.about = clean(r.snippet, 240);
          note(data, 'about', data.about, r.url);
        }
      } else if (host.includes('facebook.com') && !data.facebook) {
        data.facebook = r.url;
        note(data, 'facebook', r.url, r.url);
      } else if (!data.website && looksLikeOfficialSite(host, name, company.website)) {
        data.website = r.url;
        note(data, 'website', r.url, r.url);
      } else if (data.other_links.length < 8 && !data.other_links.includes(r.url)) {
        data.other_links.push(r.url);
      }
    }

    // Structured sources outrank a guessed organic hit.
    if (kg?.website && isPlausibleSite(kg.website)) {
      data.website = kg.website;
      note(data, 'website', kg.website, 'google:knowledge-graph');
    } else if (place?.website && isPlausibleSite(place.website)) {
      data.website = place.website;
      note(data, 'website', place.website, 'google:maps');
    }
    if (!data.website && company.website) {
      data.website = company.website;
      note(data, 'website', company.website, 'crm');
    }

    // Google Maps is the most reliable non-LLM source of a street address + phone.
    if (place?.address) {
      data.address = clean(place.address, 160);
      note(data, 'address', data.address, 'google:maps');
    }
    if (place?.phoneNumber) {
      data.phone = place.phoneNumber.trim();
      note(data, 'phone', data.phone, 'google:maps');
    }
    if (place?.category && !data.industry) {
      data.industry = place.category;
      note(data, 'industry', data.industry, 'google:maps');
    }
    if (kg?.type && !data.industry) {
      data.industry = kg.type;
      note(data, 'industry', data.industry, 'google:knowledge-graph');
    }
    if (kg?.description && !data.about) {
      data.about = clean(kg.description, 240);
      note(data, 'about', data.about, 'google:knowledge-graph');
    }
    for (const [k, v] of Object.entries(kg?.attributes ?? {})) {
      if (!data.phone && /phone|telephone/i.test(k)) {
        data.phone = v;
        note(data, 'phone', v, 'google:knowledge-graph');
      }
      if (!data.address && /address|headquarters/i.test(k)) {
        data.address = clean(v, 160);
        note(data, 'address', data.address, 'google:knowledge-graph');
      }
    }

    // ---- Stages 3-5: crawl the site and extract ---------------------------
    if (data.website) {
      try {
        await crawlSite(data.website, data, errors);
      } catch (e) {
        errors.push(`scrape: ${msg(e)}`);
      }
    }

    // ---- Stage 6: persist --------------------------------------------------
    dedupeContacts(data);

    const { error: upErr } = await admin.from('kyc_profiles').upsert(
      {
        owner_id: userId,
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

    await saveContacts(admin, userId, company_id, data, errors);

    // Improve the company record itself so the dashboard benefits too.
    const companyPatch: Record<string, string> = {};
    if (!company.website && data.website) companyPatch.website = data.website;
    if (!company.industry && data.industry) companyPatch.industry = data.industry;
    if (Object.keys(companyPatch).length > 0) {
      await admin
        .from('companies')
        .update(companyPatch)
        .eq('id', company_id)
        .eq('owner_id', userId);
    }

    return json({ ok: true, company_id, enriched_data: data, errors });
  } catch (e) {
    return json({ ok: false, errors: [...errors, msg(e)] }, 500);
  }
});

// --- Serper ----------------------------------------------------------------

/** google.serper.dev/search — organic results PLUS the knowledge panel. */
async function serperSearch(
  query: string
): Promise<{ organic: SearchResult[]; knowledgeGraph: KnowledgeGraph | null }> {
  const key = Deno.env.get('SEARCH_API_KEY');
  if (!key) return { organic: [], knowledgeGraph: null };
  const url = Deno.env.get('SEARCH_API_URL') ?? 'https://google.serper.dev/search';

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query, num: 10 }),
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`search ${res.status}: ${(await res.text()).slice(0, 200)}`);

  const body = (await res.json()) as {
    organic?: { title: string; link: string; snippet?: string }[];
    knowledgeGraph?: KnowledgeGraph;
  };
  return {
    organic: (body.organic ?? []).map((v) => ({
      title: v.title,
      url: v.link,
      snippet: v.snippet ?? '',
    })),
    knowledgeGraph: body.knowledgeGraph ?? null,
  };
}

/** google.serper.dev/places — the Google Maps listing: address + phone + site. */
async function serperPlaces(query: string): Promise<PlaceResult[]> {
  const key = Deno.env.get('SEARCH_API_KEY');
  if (!key) return [];
  const res = await fetch('https://google.serper.dev/places', {
    method: 'POST',
    headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query }),
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) return [];
  const body = (await res.json()) as { places?: PlaceResult[] };
  return body.places ?? [];
}

/** Only trust a Maps hit whose title actually resembles the company we asked for. */
function pickPlace(places: PlaceResult[], name: string): PlaceResult | null {
  const wanted = tokens(name);
  if (wanted.length === 0) return places[0] ?? null;
  for (const p of places) {
    const title = (p.title ?? '').toLowerCase();
    if (wanted.some((t) => title.includes(t))) return p;
  }
  return null;
}

// --- crawl -----------------------------------------------------------------

/** Homepage, then the Contact / About / Team pages linked from it. */
async function crawlSite(website: string, data: KycData, errors: string[]) {
  const home = await fetchPage(website);
  if (!home) return;

  absorb(home.html, home.url, data);

  const subUrls = discoverSubPages(home.html, home.url).slice(0, MAX_SUBPAGES);
  const pages = await Promise.all(
    subUrls.map((u) =>
      fetchPage(u).catch((e) => {
        errors.push(`scrape ${u}: ${msg(e)}`);
        return null;
      })
    )
  );
  for (const p of pages) {
    if (p) absorb(p.html, p.url, data);
  }
}

async function fetchPage(url: string): Promise<{ html: string; url: string } | null> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KYC-enrichment-bot)' },
    signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
    redirect: 'follow',
  });
  if (!res.ok) return null;
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('html')) return null;
  const html = (await res.text()).slice(0, MAX_PAGE_BYTES);
  return { html, url: res.url || url };
}

const SUBPAGE_RE = /(contact|about|team|people|our-people|staff|impressum|kontakt)/i;

function discoverSubPages(html: string, baseUrl: string): string[] {
  const base = safeHost(baseUrl);
  const out = new Set<string>();
  const re = /<a\b[^>]*href=["']([^"'#]+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const href = m[1].trim();
    if (!href || href.startsWith('mailto:') || href.startsWith('tel:')) continue;
    let abs: URL;
    try {
      abs = new URL(href, baseUrl);
    } catch {
      continue;
    }
    if (abs.hostname.toLowerCase() !== base) continue; // same site only
    if (!SUBPAGE_RE.test(abs.pathname)) continue;
    abs.hash = '';
    if (abs.toString() !== baseUrl) out.add(abs.toString());
  }
  return [...out];
}

// --- extraction ------------------------------------------------------------

/** Pull everything we can from one page, best-quality source first. */
function absorb(html: string, url: string, data: KycData) {
  const text = htmlToText(html);

  // 1. JSON-LD — real structured data. This is where the clean values come from.
  for (const node of parseJsonLd(html)) {
    const type = String(node['@type'] ?? '').toLowerCase();

    if (/organization|localbusiness|corporation|store|professionalservice/.test(type)) {
      const addr = formatPostalAddress(node.address);
      if (addr && !data.address) {
        data.address = clean(addr, 160);
        note(data, 'address', data.address, url);
      }
      const tel = firstString(node.telephone);
      if (tel && !data.phone) {
        data.phone = tel.trim();
        note(data, 'phone', data.phone, url);
      }
      const desc = firstString(node.description);
      if (desc && !data.about) {
        data.about = clean(desc, 240);
        note(data, 'about', data.about, url);
      }
      const email = firstString(node.email);
      if (email && validEmail(normEmail(email))) {
        addContact(data, { email: normEmail(email), source_url: url });
      }
      for (const s of asArray(node.sameAs)) {
        const link = typeof s === 'string' ? s : '';
        const host = safeHost(link);
        if (!host) continue;
        if (host.includes('linkedin.com') && !data.linkedin) {
          data.linkedin = link;
          note(data, 'linkedin', link, url);
        } else if (host.includes('facebook.com') && !data.facebook) {
          data.facebook = link;
          note(data, 'facebook', link, url);
        } else if (data.other_links.length < 8 && !data.other_links.includes(link)) {
          data.other_links.push(link);
        }
      }
    }

    if (type.includes('person')) {
      const email = firstString(node.email);
      if (email && validEmail(normEmail(email))) {
        addContact(data, {
          email: normEmail(email),
          name: firstString(node.name),
          role: firstString(node.jobTitle),
          phone: firstString(node.telephone),
          source_url: url,
        });
      }
    }
  }

  // 2. mailto: / tel: links — reliable, and the surrounding markup names the person.
  const mailRe = /<a\b[^>]*href=["']\s*mailto:([^"'?\s]+)[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = mailRe.exec(html))) {
    let raw = m[1];
    try {
      raw = decodeURIComponent(raw);
    } catch {
      /* leave as-is */
    }
    const email = normEmail(raw);
    if (!validEmail(email)) continue;

    const anchorText = stripTags(m[2]);
    const near = nearbyPerson(html, m.index);
    // The anchor text is a name only when it isn't just the address again.
    const name =
      anchorText && !anchorText.includes('@') && anchorText.length < 60
        ? anchorText
        : near.name;
    addContact(data, { email, name, role: near.role, source_url: url });
  }

  const telRe = /<a\b[^>]*href=["']\s*tel:([^"']+)["']/gi;
  while ((m = telRe.exec(html))) {
    const phone = m[1].replace(/[^\d+\-() ]/g, '').trim();
    if (phone.replace(/\D/g, '').length < 8) continue;
    if (!data.phone) {
      data.phone = phone;
      note(data, 'phone', phone, url);
    }
  }

  // 3. Meta description as an `about` fallback.
  if (!data.about) {
    const og =
      html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ??
      html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
    if (og?.[1]) {
      data.about = clean(og[1], 240);
      note(data, 'about', data.about, url);
    }
  }

  // 4. Last resort: free-text regex. Only reached when every structured source
  //    came up empty — this is what produced the "messy" output before.
  if (data.contacts.length === 0) {
    for (const raw of [...new Set(text.match(EMAIL_RE) ?? [])].slice(0, 5)) {
      const email = normEmail(raw);
      if (validEmail(email)) addContact(data, { email, source_url: url });
    }
  }
  if (!data.phone) {
    const phone = (text.match(PHONE_RE) ?? [])
      .map((p) => p.trim())
      .find((p) => p.replace(/\D/g, '').length >= 8);
    if (phone) {
      data.phone = phone;
      note(data, 'phone', phone, url);
    }
  }
  if (!data.address) {
    const addr = extractAddress(text);
    if (addr) {
      data.address = addr;
      note(data, 'address', addr, url);
    }
  }
  if (!data.about) {
    const about = clean(text, 240);
    if (about.length > 40) {
      data.about = about;
      note(data, 'about', about, url);
    }
  }
}

const ROLE_RE =
  /\b(ceo|cto|cfo|coo|founder|co-?founder|owner|president|principal|partner|director|manager|head of [a-z ]{3,25}|architect|engineer|consultant|sales|business development|administrator|accounts?|procurement|marketing)\b/i;

/**
 * Walk back from a mailto: link to find the person it belongs to. Without a DOM
 * we window the raw HTML: on a team/contact page the nearest preceding heading is
 * almost always the person's name, and a role keyword sits close by.
 */
function nearbyPerson(html: string, at: number): { name?: string; role?: string } {
  const before = html.slice(Math.max(0, at - 900), at);
  const after = html.slice(at, Math.min(html.length, at + 400));

  let name: string | undefined;
  const headings = [
    ...before.matchAll(/<(h[1-6]|strong|b|figcaption)\b[^>]*>([\s\S]*?)<\/\1>/gi),
  ];
  for (let i = headings.length - 1; i >= 0; i--) {
    const candidate = stripTags(headings[i][2]);
    // A person's name: 2-4 capitalised words, no email, not a nav label.
    if (
      candidate &&
      candidate.length <= 60 &&
      !candidate.includes('@') &&
      /^[A-Z][\p{L}'.-]+(?:\s+[A-Z][\p{L}'.-]+){1,3}$/u.test(candidate)
    ) {
      name = candidate;
      break;
    }
  }

  const roleMatch = stripTags(before).match(ROLE_RE) ?? stripTags(after).match(ROLE_RE);

  return { name, role: roleMatch ? roleMatch[0] : undefined };
}

// --- JSON-LD ---------------------------------------------------------------

type JsonLdNode = Record<string, unknown>;

function parseJsonLd(html: string): JsonLdNode[] {
  const out: JsonLdNode[] = [];
  const re = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      collectNodes(JSON.parse(m[1].trim()), out);
    } catch {
      /* malformed JSON-LD is common in the wild; skip it */
    }
  }
  return out;
}

function collectNodes(value: unknown, out: JsonLdNode[]) {
  if (Array.isArray(value)) {
    for (const v of value) collectNodes(v, out);
    return;
  }
  if (!value || typeof value !== 'object') return;
  const node = value as JsonLdNode;
  if (node['@graph']) collectNodes(node['@graph'], out);
  if (node['@type']) out.push(node);
}

function formatPostalAddress(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  const a = firstObject(value);
  if (!a) return undefined;
  const parts = [
    a.streetAddress,
    a.addressLocality,
    a.addressRegion,
    a.postalCode,
    a.addressCountry,
  ]
    .map((p) => (typeof p === 'string' ? p : firstString(p)))
    .filter((p): p is string => !!p && p.trim().length > 0);
  return parts.length ? parts.join(', ') : undefined;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : v == null ? [] : [v];
}

function firstString(v: unknown): string | undefined {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.find((x) => typeof x === 'string') as string | undefined;
  if (v && typeof v === 'object') {
    const n = (v as JsonLdNode).name;
    if (typeof n === 'string') return n;
  }
  return undefined;
}

function firstObject(v: unknown): JsonLdNode | undefined {
  if (Array.isArray(v)) {
    return v.find((x) => x && typeof x === 'object') as JsonLdNode | undefined;
  }
  if (v && typeof v === 'object') return v as JsonLdNode;
  return undefined;
}

// --- contacts --------------------------------------------------------------

function addContact(data: KycData, c: KycContact) {
  if (!c.email && !c.phone) return;
  data.contacts.push({
    name: c.name?.trim() || undefined,
    role: c.role?.trim() || undefined,
    email: c.email?.trim() || undefined,
    phone: c.phone?.trim() || undefined,
    source_url: c.source_url,
  });
}

/** Collapse duplicates by email, preferring the entry that carries a name/role. */
function dedupeContacts(data: KycData) {
  const byEmail = new Map<string, KycContact>();
  const noEmail: KycContact[] = [];

  for (const c of data.contacts) {
    if (!c.email) {
      noEmail.push(c);
      continue;
    }
    const key = c.email.toLowerCase();
    const prev = byEmail.get(key);
    if (!prev) {
      byEmail.set(key, c);
      continue;
    }
    byEmail.set(key, {
      ...prev,
      name: prev.name ?? c.name,
      role: prev.role ?? c.role,
      phone: prev.phone ?? c.phone,
      source_url: prev.source_url ?? c.source_url,
    });
  }

  data.contacts = [...byEmail.values(), ...noEmail].slice(0, 10);
}

async function saveContacts(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
  data: KycData,
  errors: string[]
) {
  for (const c of data.contacts) {
    if (!c.email && !c.phone) continue;

    // Dedupe-then-insert. The contacts unique index is FUNCTIONAL —
    // (company_id, lower(email)) where email is not null — which `onConflict`
    // cannot target: Postgres raises 42P10 and the write is silently lost.
    // See CLAUDE.md "Gotchas".
    if (c.email) {
      const { data: existing } = await admin
        .from('contacts')
        .select('id')
        .eq('company_id', companyId)
        .ilike('email', c.email.replace(/[\\%_]/g, (ch) => `\\${ch}`))
        .maybeSingle();
      if (existing) continue;
    }

    const { error } = await admin.from('contacts').insert({
      owner_id: userId,
      company_id: companyId,
      full_name: c.name ?? null,
      email: c.email ?? null,
      phone: c.phone ?? null,
      role_title: c.role ?? null,
      source: c.source_url?.includes('linkedin.com') ? 'linkedin' : 'google',
    });
    if (error && error.code !== '23505') {
      errors.push(`save contact ${c.email ?? c.phone}: ${error.message}`);
    }
  }
}

// --- text helpers ----------------------------------------------------------

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const PHONE_RE = /(?:\+?\d[\d\s().-]{6,}\d)/g;

// Addresses that are never a real person, plus filenames that merely look like
// emails (e.g. "logo@2x.png") which the old regex-only extractor happily saved.
const JUNK_EMAIL_RE =
  /^(no-?reply|donotreply|do-not-reply|postmaster|mailer-daemon|abuse)@|@(example\.|sentry\.|wixpress\.)|\.(png|jpe?g|gif|svg|webp|css|js)$/i;

const NAV_NOISE_RE =
  /\b(skip to (?:main )?content|hit enter to search or esc to close|close search|close menu|open menu|toggle navigation|back to top|read more|learn more|cookie policy|accept cookies)\b/gi;

function validEmail(email: string): boolean {
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)) return false;
  return !JUNK_EMAIL_RE.test(email);
}

function normEmail(email: string): string {
  return email.trim().toLowerCase();
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function clean(value: string, cap: number): string {
  const out = value.replace(NAV_NOISE_RE, ' ').replace(/\s+/g, ' ').trim();
  return out.length > cap ? `${out.slice(0, cap).trim()}…` : out;
}

/** Address near an ADDRESS label, else a street/postal pattern. Capped. */
function extractAddress(text: string): string | undefined {
  const labeled = text.match(
    /\bADDRESS\b[:\s]*([^]{5,120}?)(?=\b(?:TEL|TELEPHONE|PHONE|MOBILE|FAX|EMAIL|E-?MAIL)\b|$)/i
  );
  let addr = labeled?.[1];
  if (!addr) {
    addr = text.match(
      /\d{1,5}[\sA-Za-z0-9.,#-]{3,80}?(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Drive|Dr|Blvd|Way|Building|Centre|Center|Tower|Singapore)\b[\sA-Za-z0-9.,#-]{0,40}/i
    )?.[0];
  }
  addr = addr?.replace(/\s+/g, ' ').trim();
  if (!addr) return undefined;
  return addr.length > 160 ? `${addr.slice(0, 160).trim()}…` : addr;
}

/** Record where a field's value came from, so a wrong value is traceable. */
function note(data: KycData, field: string, value: string, url: string) {
  data.sources = data.sources.filter((s) => s.field !== field);
  data.sources.push({ field, value, url });
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

const AGGREGATOR_RE =
  /(facebook|instagram|twitter|x\.com|youtube|wikipedia|yelp|indeed|linkedin|crunchbase|bloomberg|glassdoor|zoominfo|dnb\.com|yellowpages|tripadvisor|google\.)/;

function isPlausibleSite(url: string): boolean {
  const host = safeHost(url);
  return !!host && !AGGREGATOR_RE.test(host);
}

const GENERIC_TOKENS = new Set([
  'pte',
  'ltd',
  'limited',
  'inc',
  'llc',
  'plc',
  'corp',
  'corporation',
  'company',
  'private',
  'group',
  'holdings',
  'the',
]);

/** Distinctive tokens of a company name — "3PA Private LTD Sg" -> ["3pa"]. */
function tokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !GENERIC_TOKENS.has(t));
}

function looksLikeOfficialSite(
  host: string,
  name: string,
  knownWebsite: string | null
): boolean {
  if (AGGREGATOR_RE.test(host)) return false;
  if (knownWebsite) {
    const known = safeHost(knownWebsite);
    if (known && host.includes(known)) return true;
  }
  // Require the host to contain a distinctive token of the company name — no
  // more "any short host wins".
  return tokens(name).some((t) => host.includes(t));
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
