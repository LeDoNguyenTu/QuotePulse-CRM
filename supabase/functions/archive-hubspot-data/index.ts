import { errorResponse, handleOptions, json } from '../_shared/cors.ts';
import { getAdminClient, getUserId } from '../_shared/supabaseAdmin.ts';
import { companyAttachmentBatchArchiveKey, dealBatchArchiveKey, getArchiveJson, putVerifiedArchive, verifyArchivePayload } from '../_shared/r2Archive.ts';
import { resolveArchiveOwner } from '../_shared/archiveAuth.ts';
import { assertCompanyArchivePointer, attachmentsForCompany, mergeAttachmentRecords, type AttachmentRecord } from '../_shared/attachmentArchive.ts';

const MAX_BATCH = 1_000;
const MAX_DEALS_PER_BATCH = 200;
const MAX_COMPANIES_PER_BATCH = 200;

type DealCandidate = {
  id: string;
  hubspot_deal_id: string;
  hubspot_modified_at: string | null;
  hubspot_properties: Record<string, string | null>;
};

type AttachmentManifest = { company_id: string; r2_key: string; r2_sha256: string };

type CompanyAttachmentBatch = {
  company_id: string;
  expected_sha256: string | null;
  item_count: number;
  attachment_ids: string[];
  attachments: AttachmentRecord[];
};

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }
  return fallback;
}

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

    const { data: deals, error: dealsError } = await admin.rpc('deal_archive_candidates', {
      p_owner_id: userId,
      p_limit: Math.min(limit, MAX_DEALS_PER_BATCH),
    });
    if (dealsError) throw dealsError;
    if ((deals ?? []).length > 0) {
      try {
        const archiveRows = ((deals ?? []) as DealCandidate[]).map((deal) => ({
          id: deal.id as string,
          hubspot_deal_id: deal.hubspot_deal_id as string,
          expected_modified_at: deal.hubspot_modified_at as string | null,
          properties: deal.hubspot_properties as Record<string, string | null>,
        }));
        const archived = await putVerifiedArchive(
          dealBatchArchiveKey(userId, crypto.randomUUID()),
          { deals: archiveRows.map(({ expected_modified_at: _expected, ...row }) => row) },
        );
        const { data: finalized, error } = await admin.rpc('finalize_deal_archive_batch', {
          p_owner_id: userId,
          p_r2_key: archived.key,
          p_r2_sha256: archived.checksum,
          p_rows: archiveRows,
        });
        if (error) throw error;
        counts.deals_archived = Number(finalized ?? 0);
        if (counts.deals_archived < archiveRows.length) {
          counts.warnings.push(`${archiveRows.length - counts.deals_archived} deal snapshot(s) changed concurrently and will be retried.`);
        }
      } catch (error) {
        counts.warnings.push(`deal batch: ${errorMessage(error, 'archive failed')}`);
      }
    }

    const { data: candidates, error: candidateError } = await admin.rpc('generic_attachment_archive_candidates', {
      p_owner_id: userId,
      p_limit: Math.min(limit, MAX_COMPANIES_PER_BATCH),
    });
    if (candidateError) throw candidateError;
    const companyIds = ((candidates ?? []) as Array<{ company_id: string }>).map((row) => row.company_id);
    if (companyIds.length > 0) {
      try {
        const { data: manifests, error: manifestError } = await admin
          .from('company_attachment_archives')
          .select('company_id, r2_key, r2_sha256')
          .eq('owner_id', userId)
          .in('company_id', companyIds);
        if (manifestError) throw manifestError;
        const manifestRows = (manifests ?? []) as AttachmentManifest[];
        const manifestByCompany = new Map(manifestRows.map((manifest) => [manifest.company_id, manifest]));
        const previousByCompany = new Map<string, AttachmentRecord[]>();
        const manifestsByKey = new Map<string, AttachmentManifest[]>();
        for (const manifest of manifestRows) {
          const companyId = manifest.company_id;
          assertCompanyArchivePointer(manifest.r2_key, userId, companyId);
          const group = manifestsByKey.get(manifest.r2_key) ?? [];
          group.push(manifest);
          manifestsByKey.set(manifest.r2_key, group);
        }
        for (const [key, groupedManifests] of manifestsByKey) {
          const expected = groupedManifests[0].r2_sha256;
          if (groupedManifests.some((manifest) => manifest.r2_sha256 !== expected)) {
            throw new Error('Companies sharing an attachment archive have inconsistent checksums.');
          }
          const payload = await getArchiveJson<unknown>(key);
          await verifyArchivePayload(JSON.stringify(payload), expected);
          for (const manifest of groupedManifests) {
            const companyId = manifest.company_id;
            previousByCompany.set(companyId, attachmentsForCompany(payload, companyId));
          }
        }

        const { data: attachments, error: attachmentError } = await admin.rpc('generic_attachments_for_archive', {
          p_owner_id: userId,
          p_company_ids: companyIds,
        });
        if (attachmentError) throw attachmentError;
        const liveByCompany = new Map<string, AttachmentRecord[]>();
        for (const { company_id: companyId, ...attachment } of (attachments ?? []) as Array<AttachmentRecord & { company_id: string }>) {
          const rows = liveByCompany.get(companyId) ?? [];
          rows.push(attachment as AttachmentRecord);
          liveByCompany.set(companyId, rows);
        }

        const batch = companyIds.flatMap<CompanyAttachmentBatch>((companyId) => {
          const liveRows = liveByCompany.get(companyId) ?? [];
          if (liveRows.length === 0) return [];
          const attachments = mergeAttachmentRecords(liveRows, previousByCompany.get(companyId) ?? []);
          return [{
            company_id: companyId,
            expected_sha256: manifestByCompany.get(companyId)?.r2_sha256 ?? null,
            item_count: attachments.length,
            attachment_ids: liveRows.map((row) => row.id),
            attachments,
          }];
        });
        if (batch.length > 0) {
          const archived = await putVerifiedArchive(
            companyAttachmentBatchArchiveKey(userId, crypto.randomUUID()),
            { companies: batch.map(({ expected_sha256: _sha, item_count: _count, attachment_ids: _ids, ...company }) => company) },
          );
          const { data: removed, error: cleanupError } = await admin.rpc('finalize_company_attachment_archive_batch', {
            p_owner_id: userId,
            p_r2_key: archived.key,
            p_r2_sha256: archived.checksum,
            p_companies: batch.map(({ attachments: _attachments, ...company }) => company),
          });
          if (cleanupError) throw cleanupError;
          counts.generic_attachments_archived = Number(removed ?? 0);
        }
      } catch (error) {
        counts.warnings.push(`attachment batch: ${errorMessage(error, 'archive failed')}`);
      }
    }
    const attempted = (deals?.length ?? 0) + companyIds.length;
    if (attempted > 0 && counts.deals_archived === 0 && counts.generic_attachments_archived === 0 && counts.warnings.length > 0) {
      return errorResponse(`Archive batch failed: ${counts.warnings[0]}`, 500);
    }
    return json({ ok: true, ...counts });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Could not archive HubSpot data', 500);
  }
});
