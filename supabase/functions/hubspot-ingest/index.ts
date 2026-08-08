// Edge Function: hubspot-ingest
// Pulls HubSpot CRM data into Supabase in priority order:
//   1) recycled/archived deals  2) deleted accounts  3) active deals
// Cleans deal names into canonical companies and links deals/contacts/attachments.
//
// Three things this function used to get wrong, all of which looked like
// "nothing happens when I click import":
//   * it sent the raw Settings token as a bearer token — but a HubSpot personal
//     access key is a refresh credential, not a bearer token (see _shared/hubspot.ts)
//   * it asked for associations=…,notes,quotes; HubSpot 403s the ENTIRE deals
//     request if any one association is out of scope, killing both deal passes
//   * it stopped after 200 deals of an oldest-first listing, so a portal with
//     more than 200 deals could never reach a newly created one
// It also swallowed every error and still returned HTTP 200 {ok:true}.
import { handleOptions, json, errorResponse } from '../_shared/cors.ts';
import { getAdminClient, getUserId, getUserSettings } from '../_shared/supabaseAdmin.ts';
import {
  parseDealName,
  cleanCompanyName,
  learnProducts,
  productKey,
} from '../_shared/dealName.ts';
import { classifyIndustry, normalizeHubspotIndustry } from '../_shared/industry.ts';
import {
  HubSpotClient,
  HubSpotApiError,
  extractContactsFromText,
  type HsObject,
} from '../_shared/hubspot.ts';
import {
  chunkPropertyNames,
  mergeHubspotProperties,
  propertySchemaVersion,
  type HubspotPropertyDefinition,
} from '../_shared/hubspotProperties.ts';
import { associatedObjectIds } from '../_shared/hubspotAssociations.ts';
import { isMissingAttachmentMetadata } from '../_shared/hubspotAttachments.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';

// Deliberately well under the ~150s Edge wall-time limit. Each invocation is one
// visible step of the progress bar, so shorter runs mean the UI actually moves —
// the work is resumable from sync_state, and the browser drives it in a loop.
const TIME_BUDGET_MS = 30_000;
const PAGE_SIZE = 100;
const MAX_OBJECTS_PER_RUN = 5000; // safety valve

const DEAL_PROPS = [
  'dealname',
  'dealstage',
  'pipeline',
  'amount',
  'createdate',
  'hs_lastmodifieddate',
];

// A backfill is considered complete once we hold within this many of HubSpot's
// own deal count. Slack absorbs the handful of deals that get archived or deleted
// in HubSpot between the count and the crawl.
const CATCHUP_SLACK = 25;
const COMPANY_PROPS = ['name', 'domain', 'industry', 'website'];
const CONTACT_PROPS = ['firstname', 'lastname', 'email', 'phone', 'jobtitle'];
const NOTE_PROPS = ['hs_note_body', 'hs_attachment_ids'];

const ASSOC_FULL = ['companies', 'contacts', 'notes', 'quotes'];
const ASSOC_NO_EXTRAS = ['companies', 'contacts'];
const ASSOC_MINIMAL = ['companies'];

interface Counts {
  companies: number;
  deals: number;
  contacts: number;
  attachments: number;
  skipped_trashed: number;
  /** Deals HubSpot returned that we already hold unchanged — not re-read. */
  skipped_existing: number;
}

interface Ctx {
  hs: HubSpotClient;
  admin: SupabaseClient;
  userId: string;
  counts: Counts;
  errors: string[];
  warnings: string[];
  assoc: string[];
  filesAllowed: boolean;
  deadline: number;
  processed: number;
  /** Vendor names, keyed by productKey(), used to split unpunctuated deal names. */
  products: Set<string>;
  /** HubSpot's total active-deal count, fetched once per invocation (null if unknown). */
  dealTotal: number | null;
  propertyDefinitions: Record<ImportObjectType, HubspotPropertyDefinition[]>;
  propertyVersions: Record<ImportObjectType, string>;
  objectCache: Map<string, HsObject>;
}

type ImportObjectType = 'deals' | 'companies' | 'contacts';

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  const counts: Counts = {
    companies: 0,
    deals: 0,
    contacts: 0,
    attachments: 0,
    skipped_trashed: 0,
    skipped_existing: 0,
  };
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    const userId = await getUserId(req);
    const admin = getAdminClient();

    const body = (await req.json().catch(() => ({}))) as { mode?: string };

    // Repair pass over data we already hold — no HubSpot calls, so it runs even
    // without a token.
    if (body?.mode === 'rebuild') {
      return json(await rebuildCompanies(admin, userId));
    }

    const settings = await getUserSettings(admin, userId);
    const token = settings?.hubspot_token;
    if (!token) {
      return errorResponse('No HubSpot token found. Add it in Settings first.', 400);
    }

    // Resolves a private-app token as-is, or exchanges a personal access key.
    // Throws a quotable error rather than letting a 401 vanish into errors[].
    let hs: HubSpotClient;
    try {
      hs = await HubSpotClient.connect(token);
    } catch (e) {
      return errorResponse(e instanceof Error ? e.message : String(e), 400);
    }

    const propertyDefinitions = await loadPropertyDefinitions(hs, admin, userId, warnings);
    const ctx: Ctx = {
      hs,
      admin,
      userId,
      counts,
      errors,
      warnings,
      assoc: await negotiateAssociations(hs, warnings),
      filesAllowed: true,
      deadline: Date.now() + TIME_BUDGET_MS,
      processed: 0,
      products: await loadProductDictionary(admin, userId),
      dealTotal: await hs.countAll('deals'),
      propertyDefinitions,
      propertyVersions: {
        deals: propertySchemaVersion(propertyDefinitions.deals),
        companies: propertySchemaVersion(propertyDefinitions.companies),
        contacts: propertySchemaVersion(propertyDefinitions.contacts),
      },
      objectCache: new Map(),
    };

    // A previous sync may have recorded attachments as file-<id> when the token
    // lacked Files access. Retrying a small batch here repairs them automatically
    // on the same Run HubSpot import button once that scope becomes available.
    await repairMissingAttachmentMetadata(ctx);

    // Are we still missing deals? Decide from LIVE COUNTS, not a stored phase flag.
    // The stored flag stranded 127k deals: an earlier (smaller) portal's backfill
    // finished and latched phase='incremental'; after a bigger portal was connected,
    // every run only pulled recently-modified deals and never the older historical
    // ones. Counting on each run means a real gap always forces a backfill.
    const caughtUp = await dealsCaughtUp(ctx);

    // Active deals: backfill until caught up, then cheap incremental catch-up.
    await sweepDeals(ctx, {
      archived: false,
      priority: 'current',
      stream: 'deals:current',
      caughtUp,
    });

    // Archived records are invisible to the Search API, so those streams re-page
    // from the top on EVERY run. Sweeping them before the main backfill is caught
    // up would burn each 30s slice re-reading the recycle bin while brand-new deals
    // waited. Only touch them once the active backfill has landed.
    if (caughtUp && !outOfBudget(ctx)) {
      await sweepDeals(ctx, { archived: true, priority: 'recycled', stream: 'deals:recycled' });
      await sweepArchivedCompanies(ctx);
    }

    const done = Date.now() < ctx.deadline && ctx.processed < MAX_OBJECTS_PER_RUN;

    const importedNothing =
      counts.companies === 0 && counts.deals === 0 && counts.contacts === 0;

    // Do NOT report success when every call failed. The old version returned
    // ok:true here, so a total auth failure rendered as "import complete: 0 companies".
    if (importedNothing && errors.length > 0) {
      return json({ ok: false, counts, errors, warnings, done: false }, 502);
    }

    return json({ ok: true, counts, errors, warnings, done, progress: await progress(ctx) });
  } catch (e) {
    return json(
      {
        ok: false,
        counts,
        warnings,
        errors: [...errors, e instanceof Error ? e.message : String(e)],
        done: false,
      },
      500
    );
  }
});

// ---------------------------------------------------------------------------

/**
 * HubSpot rejects the whole request with 403 if ANY requested association type is
 * outside the token's scopes — so one missing scope (notes, quotes) silently kills
 * the entire deals import. Probe once and fall back to what the token can actually
 * see, telling the user exactly which scope is missing.
 */
async function negotiateAssociations(
  hs: HubSpotClient,
  warnings: string[]
): Promise<string[]> {
  const attempts: { assoc: string[]; note?: string }[] = [
    { assoc: ASSOC_FULL },
    {
      assoc: ASSOC_NO_EXTRAS,
      note:
        'HubSpot token lacks crm.objects.notes.read and/or crm.objects.quotes.read — ' +
        'importing companies, deals and contacts only. Notes, quotes and their attachments are skipped.',
    },
    {
      assoc: ASSOC_MINIMAL,
      note:
        'HubSpot token also lacks crm.objects.contacts.read — importing companies and deals only.',
    },
  ];

  for (const attempt of attempts) {
    try {
      await hs.probeAssociations('deals', attempt.assoc);
      if (attempt.note) warnings.push(attempt.note);
      return attempt.assoc;
    } catch (e) {
      if (e instanceof HubSpotApiError && e.status === 403) continue;
      throw e; // 401 / 5xx / network — a real failure, not a scope problem
    }
  }
  throw new HubSpotApiError(
    403,
    '/crm/v3/objects/deals',
    'The HubSpot token cannot read deals at all. Grant crm.objects.deals.read.'
  );
}

const FALLBACK_PROPERTY_DEFINITIONS: Record<ImportObjectType, HubspotPropertyDefinition[]> = {
  deals: DEAL_PROPS.map((name) => ({ name, label: name, hubspotDefined: true })),
  companies: COMPANY_PROPS.map((name) => ({ name, label: name, hubspotDefined: true })),
  contacts: CONTACT_PROPS.map((name) => ({ name, label: name, hubspotDefined: true })),
};

/** Read and retain each owner's standard and custom HubSpot field catalogue. */
async function loadPropertyDefinitions(
  hs: HubSpotClient,
  admin: SupabaseClient,
  userId: string,
  warnings: string[]
): Promise<Record<ImportObjectType, HubspotPropertyDefinition[]>> {
  const loaded = {} as Record<ImportObjectType, HubspotPropertyDefinition[]>;
  for (const objectType of ['deals', 'companies', 'contacts'] as const) {
    try {
      const definitions = await hs.listProperties(objectType);
      const { error } = await admin.from('hubspot_property_catalog').upsert(
        definitions.map((definition) => ({
          owner_id: userId,
          object_type: objectType,
          property_name: definition.name,
          label: definition.label || definition.name,
          data_type: definition.type ?? null,
          field_type: definition.fieldType ?? null,
          group_name: definition.groupName ?? null,
          display_order: definition.displayOrder ?? null,
          hubspot_defined: !!definition.hubspotDefined,
        })),
        { onConflict: 'owner_id,object_type,property_name' }
      );
      if (error) throw error;
      loaded[objectType] = definitions;
    } catch (error) {
      warnings.push(
        `Could not read all HubSpot ${objectType} properties; retaining the existing core fields only. ${msg(error)}`
      );
      loaded[objectType] = FALLBACK_PROPERTY_DEFINITIONS[objectType];
    }
  }
  return loaded;
}

/** Hydrates a regular HubSpot page (up to 100 objects) through efficient batch reads. */
async function hydrateProperties(
  ctx: Ctx,
  objectType: ImportObjectType,
  objects: HsObject[]
): Promise<HsObject[]> {
  if (objects.length === 0) return objects;
  const byId = new Map(objects.map((object) => [object.id, object]));
  const names = ctx.propertyDefinitions[objectType].map((definition) => definition.name);
  for (const propertyChunk of chunkPropertyNames(names)) {
    const results = await ctx.hs.batchRead(objectType, objects.map((object) => object.id), propertyChunk);
    for (const result of results) {
      const current = byId.get(result.id);
      if (current) current.properties = mergeHubspotProperties(current.properties, result.properties);
    }
  }
  return objects;
}

/**
 * A page contains up to 100 deals. Prefetch their associated companies and
 * contacts in batched property reads so processDeal can use its existing cache
 * instead of issuing one company/contact request per deal.
 */
async function prefetchAssociatedObjects(ctx: Ctx, deals: HsObject[]): Promise<void> {
  await Promise.all([
    prefetchObjectType(ctx, 'companies', associatedObjectIds(deals, 'companies')),
    prefetchObjectType(ctx, 'contacts', associatedObjectIds(deals, 'contacts')),
  ]);
}

async function prefetchObjectType(
  ctx: Ctx,
  objectType: 'companies' | 'contacts',
  ids: string[]
): Promise<void> {
  for (let start = 0; start < ids.length; start += PAGE_SIZE) {
    if (outOfBudget(ctx)) return;
    const batch = ids.slice(start, start + PAGE_SIZE).map((id) => ({ id, properties: {} }));
    const hydrated = await hydrateProperties(ctx, objectType, batch);
    for (const object of hydrated) ctx.objectCache.set(`${objectType}:${object.id}`, object);
  }
}

/** Fetches and caches a full company/contact snapshot once per import run. */
async function getCompleteObject(
  ctx: Ctx,
  objectType: 'companies' | 'contacts',
  id: string,
  coreProperties: string[]
): Promise<HsObject> {
  const cacheKey = `${objectType}:${id}`;
  const cached = ctx.objectCache.get(cacheKey);
  if (cached) return cached;
  const base = await ctx.hs.getOne(objectType, id, coreProperties);
  const [complete] = await hydrateProperties(ctx, objectType, [base]);
  const result = complete ?? base;
  ctx.objectCache.set(cacheKey, result);
  return result;
}

async function sweepDeals(
  ctx: Ctx,
  opts: {
    archived: boolean;
    priority: 'recycled' | 'current';
    stream: string;
    /** Active stream only: have we already imported (nearly) every deal? */
    caughtUp?: boolean;
  }
) {
  try {
    const state = await loadSyncState(ctx.admin, ctx.userId, opts.stream);

    // INCREMENTAL — only when the active backfill has genuinely caught up. Pulls
    // just the deals modified since the watermark, which is cheap. Never taken
    // while a gap remains, so it can no longer strand un-imported deals.
    if (!opts.archived && opts.caughtUp && state.last_synced_at) {
      const startedAt = new Date().toISOString();
      let after: string | undefined;
      do {
        if (outOfBudget(ctx)) return;
        const pageRes = await ctx.hs.searchModifiedSince(
          'deals',
          state.last_synced_at,
          DEAL_PROPS,
          after
        );
        for (const hit of pageRes.results) {
          if (outOfBudget(ctx)) return;
          try {
            // Search doesn't return associations — hydrate each changed deal.
            const deal = await ctx.hs.getOne('deals', hit.id, DEAL_PROPS, ctx.assoc);
            const [completeDeal] = await hydrateProperties(ctx, 'deals', [deal]);
            await processDeal(ctx, completeDeal ?? deal, opts.priority);
          } catch (e) {
            ctx.errors.push(`deal ${hit.id}: ${msg(e)}`);
          }
          ctx.processed++;
        }
        after = pageRes.after;
      } while (after);

      await saveSyncState(ctx.admin, ctx.userId, opts.stream, {
        phase: 'incremental',
        page_cursor: null,
        last_synced_at: startedAt,
      });
      return;
    }

    // BACKFILL — page through everything, persisting the cursor so the next run
    // RESUMES instead of restarting. onlyChanged() makes re-encountering an
    // already-held deal a no-op (one DB lookup, no HubSpot fan-out), so even a
    // full re-page to hunt stragglers is cheap.
    let cursor = state.page_cursor ?? undefined;
    const startedAt = new Date().toISOString();
    const startedFromTop = !state.page_cursor;
    const importedAtStart = ctx.counts.deals;

    for (;;) {
      if (outOfBudget(ctx)) {
        await saveSyncState(ctx.admin, ctx.userId, opts.stream, {
          phase: 'backfill',
          page_cursor: cursor ?? null,
          last_synced_at: state.last_synced_at,
        });
        return;
      }

      const pageRes = await ctx.hs.page('deals', {
        archived: opts.archived,
        properties: DEAL_PROPS,
        associations: ctx.assoc,
        limit: PAGE_SIZE,
        after: cursor,
      });

      const changedDeals = await onlyChanged(ctx, pageRes.results);
      const hydratedDeals = await hydrateProperties(ctx, 'deals', changedDeals);
      await prefetchAssociatedObjects(ctx, hydratedDeals);
      for (const deal of hydratedDeals) {
        if (outOfBudget(ctx)) break;
        try {
          await processDeal(ctx, deal, opts.priority);
        } catch (e) {
          ctx.errors.push(`deal ${deal.id}: ${msg(e)}`);
        }
        ctx.processed++;
      }

      cursor = pageRes.after;
      if (!cursor) break; // reached the end of the listing
    }

    // A full pass finished. The active stream only graduates to incremental once
    // the row count proves we actually hold everything; otherwise it stays in
    // backfill with a null cursor so the next run re-pages from the top and picks
    // up whatever was missed (deals added mid-crawl, transient failures, or a
    // listing that did not surface every record in one pass). Archived streams
    // have no incremental mode and simply re-sweep.
    let phase: 'backfill' | 'incremental' = 'backfill';
    if (!opts.archived) {
      const caughtUp = await dealsCaughtUp(ctx);
      // Also stop when a full re-page (top → end, all in this one run) turned up
      // nothing new: the count may never reach total if a few deals perpetually
      // error, and re-paging forever would waste every run. If we saw the whole
      // listing and imported nothing, we are as done as we can get.
      const wholeListingNoNew = startedFromTop && ctx.counts.deals === importedAtStart;
      phase = caughtUp || wholeListingNoNew ? 'incremental' : 'backfill';
    }
    await saveSyncState(ctx.admin, ctx.userId, opts.stream, {
      phase,
      page_cursor: null,
      last_synced_at: phase === 'incremental' ? startedAt : state.last_synced_at,
    });
  } catch (e) {
    ctx.errors.push(`deals(${opts.priority}): ${msg(e)}`);
  }
}

/** True once we hold within CATCHUP_SLACK of HubSpot's active-deal count. */
async function dealsCaughtUp(ctx: Ctx): Promise<boolean> {
  if (ctx.dealTotal == null) return false; // count unknown → keep backfilling
  const have = await countActiveDeals(ctx.admin, ctx.userId);
  return have >= ctx.dealTotal - CATCHUP_SLACK;
}

async function sweepArchivedCompanies(ctx: Ctx) {
  const stream = 'companies:deleted';
  try {
    const state = await loadSyncState(ctx.admin, ctx.userId, stream);
    let cursor = state.page_cursor ?? undefined;

    for (;;) {
      if (outOfBudget(ctx)) {
        await saveSyncState(ctx.admin, ctx.userId, stream, {
          phase: 'backfill',
          page_cursor: cursor ?? null,
          last_synced_at: state.last_synced_at,
        });
        return;
      }

      const pageRes = await ctx.hs.page('companies', {
        archived: true,
        properties: COMPANY_PROPS,
        limit: PAGE_SIZE,
        after: cursor,
      });

      for (const co of await hydrateProperties(ctx, 'companies', pageRes.results)) {
        if (outOfBudget(ctx)) break;
        const name = co.properties.name ?? 'Unknown';
        try {
          // A HubSpot company record, not a deal title — no product prefix to strip.
          const id = await upsertCompany(ctx, {
            name_clean: cleanCompanyName(name) || name,
            name_raw: name,
            industry: co.properties.industry ?? null,
            website: co.properties.website ?? co.properties.domain ?? null,
            hubspot_company_id: co.id,
            source_priority: 'deleted',
            hubspot_properties: co.properties,
            hubspot_properties_schema_version: ctx.propertyVersions.companies,
          });
          if (id) ctx.counts.companies++;
        } catch (e) {
          ctx.errors.push(`archived company ${co.id}: ${msg(e)}`);
        }
        ctx.processed++;
      }

      cursor = pageRes.after;
      if (!cursor) break;
    }

    await saveSyncState(ctx.admin, ctx.userId, stream, {
      phase: 'backfill',
      page_cursor: null,
      last_synced_at: new Date().toISOString(),
    });
  } catch (e) {
    ctx.errors.push(`archived companies: ${msg(e)}`);
  }
}

async function processDeal(ctx: Ctx, deal: HsObject, priority: 'recycled' | 'current') {
  const rawName = deal.properties.dealname ?? '';

  // "ADOBE (REN) - THE PR PEOPLE PTE LTD" — the customer is the SECOND segment.
  // The leading token is the vendor whose product they are buying, and treating it
  // as the company is what merged 374 unrelated customers into one row called
  // "Adsk". See _shared/dealName.ts.
  const parsed = parseDealName(rawName, ctx.products);

  // Every product we resolve makes the next unpunctuated name easier to cut.
  if (parsed.product) ctx.products.add(productKey(parsed.product));

  // Enrich company fields from the associated HubSpot company, if any. A real
  // company record beats anything parsed out of a deal title, so its name wins.
  let hubspotIndustry: string | null = null;
  let website: string | null = null;
  let hubspotCompanyId: string | null = null;
  let hubspotCompanyName: string | null = null;
  const assocCompany = deal.associations?.companies?.results?.[0];
  if (assocCompany) {
    hubspotCompanyId = assocCompany.id;
    try {
      const co = await getCompleteObject(ctx, 'companies', assocCompany.id, COMPANY_PROPS);
      hubspotIndustry = co.properties.industry ?? null;
      website = co.properties.website ?? co.properties.domain ?? null;
      hubspotCompanyName = co.properties.name ?? null;
    } catch (e) {
      ctx.errors.push(`company ${assocCompany.id}: ${msg(e)}`);
    }
  }

  const nameRaw = hubspotCompanyName ?? parsed.company_raw ?? rawName;
  const cleaned =
    (hubspotCompanyName ? cleanCompanyName(hubspotCompanyName) : parsed.company_clean) ||
    rawName ||
    'Unknown';

  // HubSpot's own value first; otherwise read the trade off the name, which in this
  // book of business is remarkably explicit ("SUNLEY M&E ENGINEERING PTE LTD").
  const industry = normalizeHubspotIndustry(hubspotIndustry) ?? classifyIndustry(cleaned);

  const companyId = await upsertCompany(ctx, {
    name_clean: cleaned,
    name_raw: nameRaw,
    industry,
    website,
    hubspot_company_id: hubspotCompanyId,
    source_priority: priority,
    hubspot_properties: hubspotCompanyId
      ? (ctx.objectCache.get(`companies:${hubspotCompanyId}`)?.properties ?? {})
      : {},
    hubspot_properties_schema_version: hubspotCompanyId ? ctx.propertyVersions.companies : null,
  });
  // upsertCompany returns null when the company sits in the user's recycle bin.
  if (!companyId) return;
  ctx.counts.companies++;

  const { data: dealRow, error: dealErr } = await ctx.admin.from('deals').upsert(
    {
      owner_id: ctx.userId,
      hubspot_deal_id: deal.id,
      company_id: companyId,
      deal_name_raw: rawName,
      product: parsed.product || null,
      deal_stage: deal.properties.dealstage,
      pipeline: deal.properties.pipeline,
      amount: deal.properties.amount ? Number(deal.properties.amount) : null,
      is_archived: !!deal.archived || priority === 'recycled',
      archived_at: deal.archivedAt ?? null,
      // HubSpot's own timestamps — surfaced on the dashboard and used to sort
      // newest-first. hubspot_modified_at also lets the next import skip this deal
      // untouched (see onlyChanged).
      hubspot_created_at: deal.properties.createdate ?? null,
      hubspot_modified_at: deal.properties.hs_lastmodifieddate ?? null,
      hubspot_properties: deal.properties,
      hubspot_properties_schema_version: ctx.propertyVersions.deals,
    },
    { onConflict: 'owner_id,hubspot_deal_id' }
  ).select('id').single();
  if (dealErr) throw dealErr;
  ctx.counts.deals++;
  const dealRowId = dealRow!.id as string;

  // Associated contacts.
  for (const c of deal.associations?.contacts?.results ?? []) {
    try {
      const contact = await getCompleteObject(ctx, 'contacts', c.id, CONTACT_PROPS);
      const full = [contact.properties.firstname, contact.properties.lastname]
        .filter(Boolean)
        .join(' ')
        .trim();
      const added = await saveContact(ctx, {
        company_id: companyId,
        full_name: full || null,
        email: contact.properties.email ?? null,
        phone: contact.properties.phone ?? null,
        role_title: contact.properties.jobtitle ?? null,
        source: 'hubspot_contact',
        hubspot_properties: contact.properties,
        hubspot_properties_schema_version: ctx.propertyVersions.contacts,
      });
      if (added) ctx.counts.contacts++;
    } catch (e) {
      ctx.errors.push(`contact ${c.id}: ${msg(e)}`);
    }
  }

  // Associated notes -> parse for contacts + attachment ids.
  for (const n of deal.associations?.notes?.results ?? []) {
    try {
      const note = await ctx.hs.getOne('notes', n.id, NOTE_PROPS);
      const bodyText = note.properties.hs_note_body ?? '';
      for (const ex of extractContactsFromText(bodyText)) {
        if (!ex.email && !ex.phone) continue;
        const added = await saveContact(ctx, {
          company_id: companyId,
          full_name: ex.full_name ?? null,
          email: ex.email ?? null,
          phone: ex.phone ?? null,
          role_title: ex.role_title ?? null,
          source: 'note_section',
        });
        if (added) ctx.counts.contacts++;
      }

      const attachIds = (note.properties.hs_attachment_ids ?? '')
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean);
      for (const fileId of attachIds) {
        const meta = await resolveFile(ctx, fileId);
        const added = await saveAttachment(ctx, {
          deal_id: dealRowId,
          hubspot_attachment_id: fileId,
          file_name: meta?.name ?? `file-${fileId}`,
          file_url: meta?.url ?? null,
          source_type: isQuoteName(meta?.name) ? 'quote' : 'generic',
        });
        if (added) ctx.counts.attachments++;
      }
    } catch (e) {
      ctx.errors.push(`note ${n.id}: ${msg(e)}`);
    }
  }

  // Associated quotes -> store as quote attachments.
  for (const q of deal.associations?.quotes?.results ?? []) {
    try {
      const added = await saveAttachment(ctx, {
        deal_id: dealRowId,
        hubspot_attachment_id: q.id,
        file_name: `quote-${q.id}.pdf`,
        file_url: null, // quote PDF link requires the Quotes public-link API
        source_type: 'quote',
      });
      if (added) ctx.counts.attachments++;
    } catch (e) {
      ctx.errors.push(`quote ${q.id}: ${msg(e)}`);
    }
  }
}

// --- DB helpers ------------------------------------------------------------

/**
 * Find-or-create by lower(name_clean) WITHIN THIS OWNER. Returns null when the
 * company is in the user's recycle bin: re-importing it would otherwise recreate
 * a row that company_dashboard hides (deleted_at is not null), i.e. an invisible
 * zombie that also blocks creating a fresh one via the unique name index.
 */
async function upsertCompany(
  ctx: Ctx,
  input: {
    name_clean: string;
    name_raw: string;
    industry: string | null;
    website: string | null;
    hubspot_company_id: string | null;
    source_priority: 'recycled' | 'deleted' | 'current';
    hubspot_properties?: Record<string, string | null>;
    hubspot_properties_schema_version?: string | null;
  }
): Promise<string | null> {
  const { data: existing } = await ctx.admin
    .from('companies')
    .select('id, industry, website, hubspot_company_id, deleted_at')
    .eq('owner_id', ctx.userId)
    .ilike('name_clean', escapeLike(input.name_clean))
    .maybeSingle();

  if (existing) {
    if (existing.deleted_at) {
      ctx.counts.skipped_trashed++;
      return null;
    }
    await ctx.admin
      .from('companies')
      .update({
        industry: input.industry ?? existing.industry,
        website: input.website ?? existing.website,
        hubspot_company_id: input.hubspot_company_id ?? existing.hubspot_company_id,
        ...(input.hubspot_properties ? { hubspot_properties: input.hubspot_properties } : {}),
        ...(input.hubspot_properties_schema_version
          ? { hubspot_properties_schema_version: input.hubspot_properties_schema_version }
          : {}),
      })
      .eq('id', existing.id)
      .eq('owner_id', ctx.userId);
    return existing.id as string;
  }

  const { data, error } = await ctx.admin
    .from('companies')
    .insert({ ...input, owner_id: ctx.userId })
    .select('id')
    .single();
  if (error) throw error;
  return data!.id as string;
}

/**
 * Dedupe-then-insert. The contacts unique index is FUNCTIONAL and PARTIAL —
 * (company_id, lower(email)) where email is not null — which `onConflict` cannot
 * target: Postgres raises 42P10, whose message does not contain "duplicate", so
 * the old `.includes('duplicate')` guard let it through as a hard error and every
 * HubSpot contact was silently dropped. See CLAUDE.md "Gotchas".
 */
async function saveContact(
  ctx: Ctx,
  input: {
    company_id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    role_title: string | null;
    source: string;
    hubspot_properties?: Record<string, string | null>;
    hubspot_properties_schema_version?: string;
  }
): Promise<boolean> {
  if (!input.email && !input.phone) return false;

  if (input.email) {
    const { data: dup } = await ctx.admin
      .from('contacts')
      .select('id')
      .eq('company_id', input.company_id)
      .eq('owner_id', ctx.userId)
      .ilike('email', escapeLike(input.email))
      .maybeSingle();
    if (dup) {
      if (input.hubspot_properties) {
        await ctx.admin.from('contacts').update({
          hubspot_properties: input.hubspot_properties,
          hubspot_properties_schema_version: input.hubspot_properties_schema_version ?? null,
        }).eq('id', dup.id).eq('owner_id', ctx.userId);
      }
      return false;
    }
  }

  const { error } = await ctx.admin
    .from('contacts')
    .insert({ ...input, owner_id: ctx.userId });
  if (error) {
    if (error.code === '23505') return false; // concurrent insert of the same email
    ctx.errors.push(`save contact ${input.email ?? input.phone}: ${error.message}`);
    return false;
  }
  return true;
}

/** Same 42P10 problem: attachments' unique index is partial on hubspot_attachment_id. */
async function saveAttachment(
  ctx: Ctx,
  input: {
    deal_id: string;
    hubspot_attachment_id: string;
    file_name: string;
    file_url: string | null;
    source_type: 'quote' | 'generic';
  }
): Promise<boolean> {
  const { data: dup } = await ctx.admin
    .from('attachments')
    .select('id')
    .eq('owner_id', ctx.userId)
    .eq('hubspot_attachment_id', input.hubspot_attachment_id)
    .maybeSingle();

  if (dup) {
    await ctx.admin
      .from('attachments')
      .update({ file_name: input.file_name, file_url: input.file_url, source_type: input.source_type })
      .eq('id', dup.id);
    return false;
  }

  const { error } = await ctx.admin
    .from('attachments')
    .insert({ ...input, owner_id: ctx.userId });
  if (error) {
    if (error.code === '23505') return false;
    ctx.errors.push(`save attachment ${input.hubspot_attachment_id}: ${error.message}`);
    return false;
  }
  return true;
}

// --- sync_state ------------------------------------------------------------

interface SyncState {
  phase: 'backfill' | 'incremental';
  page_cursor: string | null;
  last_synced_at: string | null;
}

async function loadSyncState(
  admin: SupabaseClient,
  userId: string,
  stream: string
): Promise<SyncState> {
  const { data } = await admin
    .from('sync_state')
    .select('phase, page_cursor, last_synced_at')
    .eq('owner_id', userId)
    .eq('object_type', stream)
    .maybeSingle();
  return {
    phase: (data?.phase as SyncState['phase']) ?? 'backfill',
    page_cursor: data?.page_cursor ?? null,
    last_synced_at: data?.last_synced_at ?? null,
  };
}

async function saveSyncState(
  admin: SupabaseClient,
  userId: string,
  stream: string,
  state: SyncState
) {
  await admin.from('sync_state').upsert(
    { owner_id: userId, object_type: stream, ...state },
    { onConflict: 'owner_id,object_type' }
  );
}

/**
 * Drop the deals we already hold, unchanged. Compares HubSpot's own
 * hs_lastmodifieddate against the copy stored on our row.
 *
 * This is what makes "run the import" a SYNC rather than a re-import. Paging a
 * deal costs one hundredth of an API call; the expense is in processDeal, which
 * fetches the associated company, every contact and every note one at a time. On a
 * portal of 5,336 deals that was several thousand HTTP calls to rediscover data
 * that had not moved.
 */
async function onlyChanged(ctx: Ctx, deals: HsObject[]): Promise<HsObject[]> {
  if (deals.length === 0) return deals;

  const { data, error } = await ctx.admin
    .from('deals')
    .select('hubspot_deal_id, hubspot_modified_at, hubspot_properties_schema_version')
    .eq('owner_id', ctx.userId)
    .in(
      'hubspot_deal_id',
      deals.map((d) => d.id)
    );
  if (error) return deals; // a failed lookup must never lose data — just re-import

  const held = new Map<string, { modifiedAt: string | null; schemaVersion: string | null }>(
    (data ?? []).map((r) => [String(r.hubspot_deal_id), {
      modifiedAt: r.hubspot_modified_at as string | null,
      schemaVersion: r.hubspot_properties_schema_version as string | null,
    }])
  );

  const changed: HsObject[] = [];
  for (const deal of deals) {
    const ours = held.get(deal.id);
    const theirs = deal.properties.hs_lastmodifieddate ?? null;

    // Only skip when we can PROVE it is unchanged: we hold the deal, both sides
    // carry a timestamp, and they agree. Anything else gets imported.
    if (
      ours && theirs &&
      Date.parse(ours.modifiedAt ?? '') === Date.parse(theirs) &&
      ours.schemaVersion === ctx.propertyVersions.deals
    ) {
      ctx.counts.skipped_existing++;
      ctx.processed++;
      continue;
    }
    changed.push(deal);
  }
  return changed;
}

/**
 * The vendor names used to cut deal names that lack a clean separator. Seeded with
 * the well-known brands, then grown from the products this user's own deals have
 * already resolved to.
 */
async function loadProductDictionary(
  admin: SupabaseClient,
  userId: string
): Promise<Set<string>> {
  const known = learnProducts([]); // the seed list
  const { data } = await admin
    .from('deals')
    .select('product')
    .eq('owner_id', userId)
    .not('product', 'is', null);
  for (const row of data ?? []) {
    const key = productKey(String(row.product ?? ''));
    if (key) known.add(key);
  }
  return known;
}

// --- progress ---------------------------------------------------------------

/**
 * What the progress bar is drawn from. The denominator comes from HubSpot's
 * Search API (which reports a `total` for any query) and the numerator from our
 * own table, so the figure survives across the many invocations one import takes.
 */
async function progress(ctx: Ctx) {
  const [dealsImported, companies, state] = await Promise.all([
    countActiveDeals(ctx.admin, ctx.userId),
    countCompanies(ctx.admin, ctx.userId),
    loadSyncState(ctx.admin, ctx.userId, 'deals:current'),
  ]);
  return {
    deals_in_hubspot: ctx.dealTotal, // already counted once this invocation
    deals_imported: dealsImported,
    companies,
    phase: state.phase,
  };
}

/** Matches HubSpot's own total, which likewise excludes archived deals. */
async function countActiveDeals(admin: SupabaseClient, userId: string): Promise<number> {
  const { count } = await admin
    .from('deals')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', userId)
    .eq('is_archived', false);
  return count ?? 0;
}

async function countCompanies(admin: SupabaseClient, userId: string): Promise<number> {
  const { count } = await admin
    .from('companies')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', userId)
    .is('deleted_at', null);
  return count ?? 0;
}

// --- rebuild ----------------------------------------------------------------

/**
 * Re-derive companies from the deal names we ALREADY hold, with no HubSpot calls.
 *
 * The old cleaner kept the text before the dash, so "ADOBE (REN) - ALPHA PLASTIC
 * INDUSTRIES PTE LTD" filed the deal under "Adobe". Since companies are deduped on
 * the cleaned name, every customer buying the same product collapsed into a single
 * row — 374 deals under "Adsk", 344 under "Adobe" — and KYC researched the vendor.
 *
 * Re-importing would not fix this on its own: the sweep is incremental, so it will
 * never revisit a deal HubSpot considers unchanged. This walks the deals table
 * instead, re-links each one to its real customer, and drops the leftover vendor
 * rows into the recycle bin (reversible, rather than deleted).
 *
 * Idempotent: a second run re-reads the deals and writes nothing.
 */
async function rebuildCompanies(admin: SupabaseClient, userId: string) {
  const deadline = Date.now() + TIME_BUDGET_MS;
  const errors: string[] = [];
  let scanned = 0;
  let remapped = 0;
  let created = 0;
  let retired = 0;
  let industries = 0;
  let done = true;

  // Learn the vendor list from the deals that ARE punctuated properly, so the ones
  // that are not ("ADOBE (REN) THE TANGLIN CLUB") can be cut in the same pass.
  const products = learnProducts(await allDealNames(admin, userId));

  // lower(name_clean) -> company. One lookup serves all 374 deals of a customer.
  const byName = new Map<string, { id: string; industry: string | null }>();
  const { data: existingCompanies, error: coErr } = await admin
    .from('companies')
    .select('id, name_clean, industry')
    .eq('owner_id', userId)
    .is('deleted_at', null);
  if (coErr) throw coErr;
  for (const c of existingCompanies ?? []) {
    byName.set(String(c.name_clean).toLowerCase(), {
      id: c.id as string,
      industry: (c.industry as string | null) ?? null,
    });
  }

  const PAGE = 500;
  let offset = 0;
  outer: for (;;) {
    const { data: deals, error } = await admin
      .from('deals')
      .select('id, company_id, deal_name_raw, product, is_archived')
      .eq('owner_id', userId)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!deals || deals.length === 0) break;

    for (const deal of deals) {
      // Out of time: stop cleanly. The next run rescans from the top, which is
      // cheap because already-correct deals need no write.
      if (Date.now() >= deadline) {
        done = false;
        break outer;
      }
      scanned++;

      const parsed = parseDealName(deal.deal_name_raw ?? '', products);
      const clean = parsed.company_clean || String(deal.deal_name_raw ?? '').trim();
      if (!clean) continue;

      const key = clean.toLowerCase();
      let company = byName.get(key);

      if (!company) {
        try {
          const made = await findOrCreateCompany(admin, userId, {
            name_clean: clean,
            name_raw: parsed.company_raw || clean,
            industry: classifyIndustry(clean),
            source_priority: deal.is_archived ? 'recycled' : 'current',
          });
          company = { id: made.id, industry: made.industry };
          if (made.created) created++;
          if (made.industry) industries++;
          byName.set(key, company);
        } catch (e) {
          errors.push(`company "${clean}": ${msg(e)}`);
          continue;
        }
      } else if (!company.industry) {
        // An existing company that predates industry classification.
        const guess = classifyIndustry(clean);
        if (guess) {
          const { error: iErr } = await admin
            .from('companies')
            .update({ industry: guess })
            .eq('id', company.id)
            .eq('owner_id', userId);
          if (!iErr) {
            company.industry = guess;
            industries++;
          }
        }
      }

      const product = parsed.product || null;
      if (company.id !== deal.company_id || product !== (deal.product ?? null)) {
        const { error: upErr } = await admin
          .from('deals')
          .update({ company_id: company.id, product })
          .eq('id', deal.id)
          .eq('owner_id', userId);
        if (upErr) errors.push(`deal ${deal.id}: ${upErr.message}`);
        else if (company.id !== deal.company_id) remapped++;
      }
    }

    if (deals.length < PAGE) break;
    offset += PAGE;
  }

  if (done) retired = await retireVendorRows(admin, userId, errors);

  return {
    ok: errors.length === 0,
    mode: 'rebuild',
    done,
    counts: { scanned, remapped, created, retired, industries },
    errors,
  };
}

/** Every deal title for this user, for the product-learning pass. */
async function allDealNames(admin: SupabaseClient, userId: string): Promise<string[]> {
  const names: string[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin
      .from('deals')
      .select('deal_name_raw')
      .eq('owner_id', userId)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) if (row.deal_name_raw) names.push(String(row.deal_name_raw));
    if (data.length < PAGE) break;
  }
  return names;
}

async function findOrCreateCompany(
  admin: SupabaseClient,
  userId: string,
  input: {
    name_clean: string;
    name_raw: string;
    industry: string | null;
    source_priority: string;
  }
): Promise<{ id: string; created: boolean; industry: string | null }> {
  const { data, error } = await admin
    .from('companies')
    .insert({ ...input, owner_id: userId })
    .select('id')
    .single();
  if (!error) return { id: data!.id as string, created: true, industry: input.industry };
  if (error.code !== '23505') throw error;

  // The name is taken. It may be a row sitting in the recycle bin — it owns deals
  // again now, so bring it back rather than leaving those deals invisible.
  const { data: found, error: findErr } = await admin
    .from('companies')
    .select('id, deleted_at, industry')
    .eq('owner_id', userId)
    .ilike('name_clean', escapeLike(input.name_clean))
    .maybeSingle();
  if (findErr || !found) throw findErr ?? new Error(`company "${input.name_clean}" vanished`);
  if (found.deleted_at) {
    await admin
      .from('companies')
      .update({ deleted_at: null })
      .eq('id', found.id)
      .eq('owner_id', userId);
  }
  return {
    id: found.id as string,
    created: false,
    industry: (found.industry as string | null) ?? null,
  };
}

/**
 * Send the vendor rows the old cleaner invented ("Adobe", "Dell", "Adsk") to the
 * recycle bin. Identified by: owns no deals any more, AND its name_raw still holds
 * a full deal title — the fingerprint of a row derived from a deal name rather than
 * typed by a person, so a hand-created company is never touched.
 */
async function retireVendorRows(
  admin: SupabaseClient,
  userId: string,
  errors: string[]
): Promise<number> {
  const { data: companies, error: coErr } = await admin
    .from('companies')
    .select('id, name_raw')
    .eq('owner_id', userId)
    .is('deleted_at', null);
  if (coErr) {
    errors.push(`retire: ${coErr.message}`);
    return 0;
  }

  const { data: deals, error: dErr } = await admin
    .from('deals')
    .select('company_id')
    .eq('owner_id', userId);
  if (dErr) {
    errors.push(`retire: ${dErr.message}`);
    return 0;
  }

  const inUse = new Set((deals ?? []).map((d) => d.company_id as string));
  const orphans = (companies ?? [])
    .filter((c) => !inUse.has(c.id as string) && /\s[-–—|]\s/.test(String(c.name_raw ?? '')))
    .map((c) => c.id as string);
  if (orphans.length === 0) return 0;

  const { error } = await admin
    .from('companies')
    .update({ deleted_at: new Date().toISOString() })
    .in('id', orphans)
    .eq('owner_id', userId);
  if (error) {
    errors.push(`retire: ${error.message}`);
    return 0;
  }
  return orphans.length;
}

// --- misc ------------------------------------------------------------------

function outOfBudget(ctx: Ctx): boolean {
  return Date.now() >= ctx.deadline || ctx.processed >= MAX_OBJECTS_PER_RUN;
}

async function repairMissingAttachmentMetadata(ctx: Ctx): Promise<void> {
  if (!ctx.filesAllowed || outOfBudget(ctx)) return;
  const { data, error } = await ctx.admin
    .from('attachments')
    .select('id, hubspot_attachment_id, file_name')
    .eq('owner_id', ctx.userId)
    .like('file_name', 'file-%')
    .limit(100);
  if (error) {
    ctx.errors.push(`find missing attachment metadata: ${error.message}`);
    return;
  }

  for (const attachment of data ?? []) {
    if (outOfBudget(ctx) || !ctx.filesAllowed) return;
    const fileName = attachment.file_name as string | null;
    const fileId = attachment.hubspot_attachment_id as string | null;
    if (!fileId || !isMissingAttachmentMetadata(fileName)) continue;
    const metadata = await resolveFile(ctx, fileId);
    if (!metadata) continue;
    const { error: updateError } = await ctx.admin
      .from('attachments')
      .update({ file_name: metadata.name, file_url: metadata.url })
      .eq('id', attachment.id)
      .eq('owner_id', ctx.userId);
    if (updateError) ctx.errors.push(`update attachment ${fileId}: ${updateError.message}`);
  }
}

/**
 * Metadata only. The download URL is deliberately NOT resolved here: HubSpot
 * hands out bytes for private files through a signed URL that expires in
 * minutes, so parse-quote mints a fresh one at parse time from
 * hubspot_attachment_id. file_url stays null for private files, which is normal.
 */
async function resolveFile(
  ctx: Ctx,
  fileId: string
): Promise<{ name: string; url: string | null } | null> {
  if (!ctx.filesAllowed) return null;
  try {
    return await ctx.hs.getFileMeta(fileId);
  } catch (e) {
    if (e instanceof HubSpotApiError && e.status === 403) {
      // Report the missing scope once, then stop hammering the Files API.
      ctx.filesAllowed = false;
      ctx.warnings.push(
        'HubSpot key cannot read Files: attachments were imported without their real ' +
          'file names, and quote OCR will not be able to download them. Regenerate the ' +
          'personal access key with the "files" scope ticked; the same import button will retry them.'
      );
      return null;
    }
    ctx.errors.push(`file ${fileId}: ${msg(e)}`);
    return null;
  }
}

/** `%` and `_` are wildcards in ilike; an unescaped company name can match many rows. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

function isQuoteName(name?: string): boolean {
  if (!name) return false;
  return /quote|myob|invoice/i.test(name) && /\.pdf$/i.test(name);
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
