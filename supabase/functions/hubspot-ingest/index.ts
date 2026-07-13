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
import { cleanDealName } from '../_shared/dealName.ts';
import {
  HubSpotClient,
  HubSpotApiError,
  extractContactsFromText,
  type HsObject,
} from '../_shared/hubspot.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';

const TIME_BUDGET_MS = 110_000; // stay inside the ~150s Edge wall-time limit
const PAGE_SIZE = 100;
const MAX_OBJECTS_PER_RUN = 5000; // safety valve

const DEAL_PROPS = ['dealname', 'dealstage', 'pipeline', 'amount', 'hs_lastmodifieddate'];
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
}

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  const counts: Counts = {
    companies: 0,
    deals: 0,
    contacts: 0,
    attachments: 0,
    skipped_trashed: 0,
  };
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    const userId = await getUserId(req);
    const admin = getAdminClient();
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
    };

    // Priority 1: recycled / archived deals. Archived records are not covered by
    // the Search API, so this stream always pages (the recycle bin is bounded).
    await sweepDeals(ctx, { archived: true, priority: 'recycled', stream: 'deals:recycled' });

    // Priority 2: deleted accounts (archived companies).
    await sweepArchivedCompanies(ctx);

    // Priority 3: current / active deals — resumable backfill, then incremental.
    await sweepDeals(ctx, { archived: false, priority: 'current', stream: 'deals:current' });

    const done = Date.now() < ctx.deadline && ctx.processed < MAX_OBJECTS_PER_RUN;
    if (!done) {
      warnings.push(
        'Import paused at the time limit and will resume where it left off — run it again to continue.'
      );
    }

    const importedNothing =
      counts.companies === 0 && counts.deals === 0 && counts.contacts === 0;

    // Do NOT report success when every call failed. The old version returned
    // ok:true here, so a total auth failure rendered as "import complete: 0 companies".
    if (importedNothing && errors.length > 0) {
      return json({ ok: false, counts, errors, warnings, done: false }, 502);
    }

    return json({ ok: true, counts, errors, warnings, done });
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

async function sweepDeals(
  ctx: Ctx,
  opts: { archived: boolean; priority: 'recycled' | 'current'; stream: string }
) {
  try {
    const state = await loadSyncState(ctx.admin, ctx.userId, opts.stream);

    // Incremental: only deals modified since the last completed sweep. Not
    // available for archived records (the Search API ignores them).
    if (!opts.archived && state.phase === 'incremental' && state.last_synced_at) {
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
            await processDeal(ctx, deal, opts.priority);
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

    // Backfill: page through everything, persisting the cursor so the next run
    // RESUMES instead of restarting from the oldest deal.
    let cursor = state.page_cursor ?? undefined;
    const startedAt = new Date().toISOString();

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

      for (const deal of pageRes.results) {
        if (outOfBudget(ctx)) break;
        try {
          await processDeal(ctx, deal, opts.priority);
        } catch (e) {
          ctx.errors.push(`deal ${deal.id}: ${msg(e)}`);
        }
        ctx.processed++;
      }

      cursor = pageRes.after;
      if (!cursor) break; // sweep complete
    }

    // Archived streams have no incremental mode — keep re-sweeping them (the
    // recycle bin is small). Active deals graduate to incremental.
    await saveSyncState(ctx.admin, ctx.userId, opts.stream, {
      phase: opts.archived ? 'backfill' : 'incremental',
      page_cursor: null,
      last_synced_at: startedAt,
    });
  } catch (e) {
    ctx.errors.push(`deals(${opts.priority}): ${msg(e)}`);
  }
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

      for (const co of pageRes.results) {
        if (outOfBudget(ctx)) break;
        const name = co.properties.name ?? 'Unknown';
        try {
          const id = await upsertCompany(ctx, {
            name_clean: cleanDealName(name) || name,
            name_raw: name,
            industry: co.properties.industry ?? null,
            website: co.properties.website ?? co.properties.domain ?? null,
            hubspot_company_id: co.id,
            source_priority: 'deleted',
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
  const cleaned = cleanDealName(rawName) || rawName || 'Unknown';

  // Enrich company fields from the associated HubSpot company, if any.
  let industry: string | null = null;
  let website: string | null = null;
  let hubspotCompanyId: string | null = null;
  const assocCompany = deal.associations?.companies?.results?.[0];
  if (assocCompany) {
    hubspotCompanyId = assocCompany.id;
    try {
      const co = await ctx.hs.getOne('companies', assocCompany.id, COMPANY_PROPS);
      industry = co.properties.industry ?? null;
      website = co.properties.website ?? co.properties.domain ?? null;
    } catch (e) {
      ctx.errors.push(`company ${assocCompany.id}: ${msg(e)}`);
    }
  }

  const companyId = await upsertCompany(ctx, {
    name_clean: cleaned,
    name_raw: rawName,
    industry,
    website,
    hubspot_company_id: hubspotCompanyId,
    source_priority: priority,
  });
  // upsertCompany returns null when the company sits in the user's recycle bin.
  if (!companyId) return;
  ctx.counts.companies++;

  const { error: dealErr } = await ctx.admin.from('deals').upsert(
    {
      owner_id: ctx.userId,
      hubspot_deal_id: deal.id,
      company_id: companyId,
      deal_name_raw: rawName,
      deal_stage: deal.properties.dealstage,
      pipeline: deal.properties.pipeline,
      amount: deal.properties.amount ? Number(deal.properties.amount) : null,
      is_archived: !!deal.archived || priority === 'recycled',
      archived_at: deal.archivedAt ?? null,
    },
    { onConflict: 'owner_id,hubspot_deal_id' }
  );
  if (dealErr) throw dealErr;
  ctx.counts.deals++;

  const dealRowId = await getDealRowId(ctx, deal.id);

  // Associated contacts.
  for (const c of deal.associations?.contacts?.results ?? []) {
    try {
      const contact = await ctx.hs.getOne('contacts', c.id, CONTACT_PROPS);
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

async function getDealRowId(ctx: Ctx, hubspotDealId: string): Promise<string> {
  const { data, error } = await ctx.admin
    .from('deals')
    .select('id')
    .eq('owner_id', ctx.userId)
    .eq('hubspot_deal_id', hubspotDealId)
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
  }
): Promise<boolean> {
  if (!input.email && !input.phone) return false;

  if (input.email) {
    const { data: dup } = await ctx.admin
      .from('contacts')
      .select('id')
      .eq('company_id', input.company_id)
      .ilike('email', escapeLike(input.email))
      .maybeSingle();
    if (dup) return false;
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

// --- misc ------------------------------------------------------------------

function outOfBudget(ctx: Ctx): boolean {
  return Date.now() >= ctx.deadline || ctx.processed >= MAX_OBJECTS_PER_RUN;
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
          'personal access key with the "files" scope ticked, then run the import again.'
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
