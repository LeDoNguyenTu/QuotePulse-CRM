import { errorResponse, handleOptions, json } from '../_shared/cors.ts';
import { getAdminClient, getUserId } from '../_shared/supabaseAdmin.ts';
import { companyAttachmentArchiveKey, dealArchiveKey, putVerifiedArchive } from '../_shared/r2Archive.ts';
import { resolveArchiveOwner } from '../_shared/archiveAuth.ts';

const MAX_BATCH = 100;

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  try {
    const body = await req.json().catch(() => ({})) as { limit?: number; owner_id?: string };
    const userId = await resolveArchiveOwner(
      req,
      body.owner_id,
      Deno.env.get('ARCHIVE_ADMIN_SECRET') ?? '',
      getUserId,
    );
    const requested = Number(body.limit ?? 50);
    const limit = Math.min(Math.max(1, requested), MAX_BATCH);
    const admin = getAdminClient();
    const counts = { deals_archived: 0, generic_attachments_archived: 0, warnings: [] as string[] };

    const { data: deals, error: dealsError } = await admin
      .from('deals')
      .select('id, hubspot_deal_id, hubspot_modified_at, hubspot_properties')
      .eq('owner_id', userId)
      .is('r2_archive_key', null)
      .not('hubspot_properties', 'is', null)
      .limit(limit);
    if (dealsError) throw dealsError;
    for (const deal of deals ?? []) {
      const properties = deal.hubspot_properties as Record<string, string | null> | null;
      if (!properties || Object.keys(properties).length === 0) continue;
      try {
        const key = dealArchiveKey(userId, deal.id as string, (deal.hubspot_modified_at as string | null) ?? new Date().toISOString());
        const archived = await putVerifiedArchive(key, { hubspot_deal_id: deal.hubspot_deal_id, properties });
        const { error } = await admin.from('deals').update({
          hubspot_properties: {}, r2_archive_key: archived.key, r2_archive_sha256: archived.checksum, r2_archived_at: new Date().toISOString(),
        }).eq('id', deal.id).eq('owner_id', userId);
        if (error) throw error;
        counts.deals_archived++;
      } catch (error) {
        counts.warnings.push(`deal ${deal.id}: ${error instanceof Error ? error.message : 'archive failed'}`);
      }
    }

    const { data: candidates, error: candidateError } = await admin
      .from('attachments')
      .select('deal_id, deals!inner(company_id)')
      .eq('owner_id', userId)
      .eq('source_type', 'generic')
      .eq('deals.owner_id', userId)
      .limit(limit);
    if (candidateError) throw candidateError;
    const companyIds = [...new Set((candidates ?? []).map((row) => (row.deals as { company_id: string | null }).company_id).filter(Boolean))] as string[];
    for (const companyId of companyIds) {
      try {
        const { data: attachments, error } = await admin
          .from('attachments')
          .select('id, deal_id, hubspot_attachment_id, file_name, file_url, source_type, parsed, parsed_summary, created_at, updated_at, deals!inner(company_id)')
          .eq('owner_id', userId).eq('source_type', 'generic').eq('deals.owner_id', userId).eq('deals.company_id', companyId);
        if (error) throw error;
        const archiveRows = (attachments ?? []).map(({ deals: _deal, ...attachment }) => attachment);
        if (!archiveRows.length) continue;
        const archived = await putVerifiedArchive(companyAttachmentArchiveKey(userId, companyId), archiveRows);
        const { error: manifestError } = await admin.from('company_attachment_archives').upsert({
          owner_id: userId, company_id: companyId, r2_key: archived.key, r2_sha256: archived.checksum, item_count: archiveRows.length,
        }, { onConflict: 'owner_id,company_id' });
        if (manifestError) throw manifestError;
        const { error: cleanupError } = await admin.rpc('delete_verified_generic_attachments', {
          p_owner_id: userId, p_company_id: companyId, p_r2_key: archived.key, p_r2_sha256: archived.checksum,
        });
        if (cleanupError) throw cleanupError;
        counts.generic_attachments_archived += archiveRows.length;
      } catch (error) {
        counts.warnings.push(`company ${companyId}: ${error instanceof Error ? error.message : 'archive failed'}`);
      }
    }
    return json({ ok: true, ...counts });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Could not archive HubSpot data', 500);
  }
});
