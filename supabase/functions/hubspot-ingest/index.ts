// Edge Function: hubspot-ingest
// Pulls HubSpot CRM data into Supabase in priority order:
//   1) recycled/archived deals  2) deleted accounts + notes  3) active deals
// Cleans deal names into canonical companies and links deals/contacts/attachments.
import { handleOptions, json, errorResponse } from '../_shared/cors.ts';
import { getAdminClient, getUserId, getUserSettings } from '../_shared/supabaseAdmin.ts';
import { cleanDealName } from '../_shared/dealName.ts';
import {
  HubSpotClient,
  extractContactsFromText,
  type HsObject,
} from '../_shared/hubspot.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';

// Bounded per-run to stay inside the Edge Function wall-time budget and free tier.
const MAX_DEALS_PER_PRIORITY = 200;

const DEAL_PROPS = ['dealname', 'dealstage', 'pipeline', 'amount', 'hs_lastmodifieddate'];
const COMPANY_PROPS = ['name', 'domain', 'industry', 'website'];
const CONTACT_PROPS = ['firstname', 'lastname', 'email', 'phone', 'jobtitle'];
const NOTE_PROPS = ['hs_note_body', 'hs_attachment_ids'];

interface Counts {
  companies: number;
  deals: number;
  contacts: number;
  attachments: number;
}

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  const counts: Counts = { companies: 0, deals: 0, contacts: 0, attachments: 0 };
  const errors: string[] = [];

  try {
    const userId = await getUserId(req);
    const admin = getAdminClient();
    const settings = await getUserSettings(admin, userId);
    const token = settings?.hubspot_token;
    if (!token) {
      return errorResponse('No HubSpot token found. Add it in Settings first.', 400);
    }

    const hs = new HubSpotClient(token);
    const body = await safeJson(req);
    const onlyCompanyId: string | undefined = body?.company_id;

    // Priority 1: recycled / archived deals.
    await ingestDeals(hs, admin, { archived: true, priority: 'recycled', counts, errors });

    // Priority 2: deleted accounts (archived companies) + their notes.
    await ingestArchivedCompanies(hs, admin, { counts, errors });

    // Priority 3: current / active deals.
    await ingestDeals(hs, admin, { archived: false, priority: 'current', counts, errors });

    // If a specific company was requested we still ran a full sweep above (the
    // cheapest correct behaviour for a scaffold); note it for the caller.
    if (onlyCompanyId) errors.push(`Ran full sync (per-company delta not implemented).`);

    return json({ ok: true, counts, errors });
  } catch (e) {
    return json(
      { ok: false, counts, errors: [...errors, e instanceof Error ? e.message : String(e)] },
      500
    );
  }
});

// ---------------------------------------------------------------------------

async function ingestDeals(
  hs: HubSpotClient,
  admin: SupabaseClient,
  opts: {
    archived: boolean;
    priority: 'recycled' | 'current';
    counts: Counts;
    errors: string[];
  }
) {
  let processed = 0;
  try {
    for await (const deal of hs.paginate('deals', {
      archived: opts.archived,
      properties: DEAL_PROPS,
      associations: ['companies', 'contacts', 'notes', 'quotes'],
    })) {
      if (processed >= MAX_DEALS_PER_PRIORITY) break;
      processed++;
      try {
        await processDeal(hs, admin, deal, opts.priority, opts.counts, opts.errors);
      } catch (e) {
        opts.errors.push(`deal ${deal.id}: ${e instanceof Error ? e.message : e}`);
      }
    }
  } catch (e) {
    opts.errors.push(`deals(${opts.priority}): ${e instanceof Error ? e.message : e}`);
  }
}

async function processDeal(
  hs: HubSpotClient,
  admin: SupabaseClient,
  deal: HsObject,
  priority: 'recycled' | 'current',
  counts: Counts,
  errors: string[]
) {
  const rawName = deal.properties.dealname ?? '';
  const cleaned = cleanDealName(rawName) || rawName || 'Unknown';

  // Enrich company fields from the associated HubSpot company, if any.
  let industry: string | null = null;
  let website: string | null = null;
  let hubspotCompanyId: string | null = null;
  const assocCompany = deal.associations?.companies?.results?.[0];
  if (assocCompany) {
    hubspotCompanyId = assocCompany.id;
    try {
      const co = await hs.getOne('companies', assocCompany.id, COMPANY_PROPS);
      industry = co.properties.industry ?? null;
      website = co.properties.website ?? co.properties.domain ?? null;
    } catch (e) {
      errors.push(`company ${assocCompany.id}: ${e instanceof Error ? e.message : e}`);
    }
  }

  const companyId = await upsertCompany(admin, {
    name_clean: cleaned,
    name_raw: rawName,
    industry,
    website,
    hubspot_company_id: hubspotCompanyId,
    source_priority: priority,
  });
  counts.companies++;

  // Upsert the deal.
  const { error: dealErr } = await admin.from('deals').upsert(
    {
      hubspot_deal_id: deal.id,
      company_id: companyId,
      deal_name_raw: rawName,
      deal_stage: deal.properties.dealstage,
      pipeline: deal.properties.pipeline,
      amount: deal.properties.amount ? Number(deal.properties.amount) : null,
      is_archived: !!deal.archived || priority === 'recycled',
      archived_at: deal.archivedAt ?? null,
    },
    { onConflict: 'hubspot_deal_id' }
  );
  if (dealErr) throw dealErr;
  counts.deals++;

  const dealRowId = await getDealRowId(admin, deal.id);

  // Associated contacts.
  for (const c of deal.associations?.contacts?.results ?? []) {
    try {
      const contact = await hs.getOne('contacts', c.id, CONTACT_PROPS);
      const full = [contact.properties.firstname, contact.properties.lastname]
        .filter(Boolean)
        .join(' ')
        .trim();
      await upsertContact(admin, {
        company_id: companyId,
        full_name: full || null,
        email: contact.properties.email ?? null,
        phone: contact.properties.phone ?? null,
        role_title: contact.properties.jobtitle ?? null,
        source: 'hubspot_contact',
      });
      counts.contacts++;
    } catch (e) {
      errors.push(`contact ${c.id}: ${e instanceof Error ? e.message : e}`);
    }
  }

  // Associated notes -> parse for contacts + attachment ids (recycled priority).
  for (const n of deal.associations?.notes?.results ?? []) {
    try {
      const note = await hs.getOne('notes', n.id, NOTE_PROPS);
      const bodyText = note.properties.hs_note_body ?? '';
      for (const ex of extractContactsFromText(bodyText)) {
        if (!ex.email && !ex.phone) continue;
        await upsertContact(admin, {
          company_id: companyId,
          full_name: ex.full_name ?? null,
          email: ex.email ?? null,
          phone: ex.phone ?? null,
          role_title: ex.role_title ?? null,
          source: 'note_section',
        });
        counts.contacts++;
      }
      // Note attachments (file ids) -> resolve URLs best-effort.
      const attachIds = (note.properties.hs_attachment_ids ?? '')
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean);
      for (const fileId of attachIds) {
        const meta = await resolveFile(hs, fileId, errors);
        await upsertAttachment(admin, {
          deal_id: dealRowId,
          hubspot_attachment_id: fileId,
          file_name: meta?.name ?? `file-${fileId}`,
          file_url: meta?.url ?? null,
          source_type: isQuoteName(meta?.name) ? 'quote' : 'generic',
        });
        counts.attachments++;
      }
    } catch (e) {
      errors.push(`note ${n.id}: ${e instanceof Error ? e.message : e}`);
    }
  }

  // Associated quotes -> store as quote attachments.
  for (const q of deal.associations?.quotes?.results ?? []) {
    try {
      await upsertAttachment(admin, {
        deal_id: dealRowId,
        hubspot_attachment_id: q.id,
        file_name: `quote-${q.id}.pdf`,
        file_url: null, // quote PDF link requires the Quotes public-link API
        source_type: 'quote',
      });
      counts.attachments++;
    } catch (e) {
      errors.push(`quote ${q.id}: ${e instanceof Error ? e.message : e}`);
    }
  }
}

async function ingestArchivedCompanies(
  hs: HubSpotClient,
  admin: SupabaseClient,
  opts: { counts: Counts; errors: string[] }
) {
  let processed = 0;
  try {
    for await (const co of hs.paginate('companies', {
      archived: true,
      properties: COMPANY_PROPS,
    })) {
      if (processed >= MAX_DEALS_PER_PRIORITY) break;
      processed++;
      const name = co.properties.name ?? 'Unknown';
      await upsertCompany(admin, {
        name_clean: cleanDealName(name) || name,
        name_raw: name,
        industry: co.properties.industry ?? null,
        website: co.properties.website ?? co.properties.domain ?? null,
        hubspot_company_id: co.id,
        source_priority: 'deleted',
      });
      opts.counts.companies++;
    }
  } catch (e) {
    opts.errors.push(`archived companies: ${e instanceof Error ? e.message : e}`);
  }
}

// --- DB helpers ------------------------------------------------------------

async function upsertCompany(
  admin: SupabaseClient,
  input: {
    name_clean: string;
    name_raw: string;
    industry: string | null;
    website: string | null;
    hubspot_company_id: string | null;
    source_priority: 'recycled' | 'deleted' | 'current';
  }
): Promise<string> {
  // Match on lower(name_clean) — the canonical key. Find-or-create + merge.
  const { data: existing } = await admin
    .from('companies')
    .select('id, industry, website, hubspot_company_id')
    .ilike('name_clean', input.name_clean)
    .maybeSingle();

  if (existing) {
    await admin
      .from('companies')
      .update({
        industry: input.industry ?? existing.industry,
        website: input.website ?? existing.website,
        hubspot_company_id: input.hubspot_company_id ?? existing.hubspot_company_id,
      })
      .eq('id', existing.id);
    return existing.id as string;
  }

  const { data, error } = await admin
    .from('companies')
    .insert(input)
    .select('id')
    .single();
  if (error) throw error;
  return data!.id as string;
}

async function getDealRowId(admin: SupabaseClient, hubspotDealId: string): Promise<string> {
  const { data, error } = await admin
    .from('deals')
    .select('id')
    .eq('hubspot_deal_id', hubspotDealId)
    .single();
  if (error) throw error;
  return data!.id as string;
}

async function upsertContact(
  admin: SupabaseClient,
  input: {
    company_id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    role_title: string | null;
    source: string;
  }
) {
  if (input.email) {
    // Rely on the (company_id, lower(email)) unique index.
    const { error } = await admin
      .from('contacts')
      .upsert(input, { onConflict: 'company_id,email', ignoreDuplicates: true });
    if (error && !`${error.message}`.includes('duplicate')) throw error;
  } else {
    await admin.from('contacts').insert(input);
  }
}

async function upsertAttachment(
  admin: SupabaseClient,
  input: {
    deal_id: string;
    hubspot_attachment_id: string;
    file_name: string;
    file_url: string | null;
    source_type: 'quote' | 'generic';
  }
) {
  const { error } = await admin
    .from('attachments')
    .upsert(input, { onConflict: 'hubspot_attachment_id', ignoreDuplicates: false });
  if (error) throw error;
}

async function resolveFile(
  hs: HubSpotClient,
  fileId: string,
  errors: string[]
): Promise<{ name: string; url: string } | null> {
  try {
    return await hs.getFileMeta(fileId);
  } catch (e) {
    errors.push(`file ${fileId}: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

function isQuoteName(name?: string): boolean {
  if (!name) return false;
  return /quote|myob|invoice/i.test(name) && /\.pdf$/i.test(name);
}

async function safeJson(req: Request): Promise<{ company_id?: string } | null> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
