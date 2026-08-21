import { errorResponse, handleOptions, json } from '../_shared/cors.ts';
import { getAdminClient, getUserId } from '../_shared/supabaseAdmin.ts';
import { getArchiveJson, verifyArchivePayload } from '../_shared/r2Archive.ts';
import { assertCompanyArchivePointer, attachmentsForCompany, mergeAttachmentRecords } from '../_shared/attachmentArchive.ts';

type Attachment = {
  id: string;
  deal_id: string | null;
  hubspot_attachment_id: string | null;
  file_name: string | null;
  file_url: string | null;
  source_type: 'quote' | 'generic';
  parsed: boolean;
  parsed_summary: unknown;
  created_at: string;
  updated_at: string;
};

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  try {
    const userId = await getUserId(req);
    const { company_id: companyId } = await req.json() as { company_id?: string };
    if (!companyId) return errorResponse('company_id is required', 400);
    const admin = getAdminClient();
    const { data: liveRows, error: liveError } = await admin
      .from('attachments')
      .select('id, deal_id, hubspot_attachment_id, file_name, file_url, source_type, parsed, parsed_summary, created_at, updated_at, deals!inner(company_id)')
      .eq('owner_id', userId)
      .eq('deals.owner_id', userId)
      .eq('deals.company_id', companyId)
      .order('created_at', { ascending: false });
    if (liveError) throw liveError;

    const { data: manifest, error: manifestError } = await admin
      .from('company_attachment_archives')
      .select('r2_key, r2_sha256')
      .eq('owner_id', userId)
      .eq('company_id', companyId)
      .maybeSingle();
    if (manifestError) throw manifestError;

    let generic: Attachment[] = [];
    if (manifest?.r2_key) {
      assertCompanyArchivePointer(manifest.r2_key as string, userId, companyId);
      const payload = await getArchiveJson<unknown>(manifest.r2_key as string);
      await verifyArchivePayload(JSON.stringify(payload), manifest.r2_sha256 as string);
      generic = attachmentsForCompany<Attachment>(payload, companyId);
    }
    const live = (liveRows ?? []).map(({ deals: _deal, ...attachment }) => attachment) as Attachment[];
    const attachments = mergeAttachmentRecords(live, generic);
    return json({ ok: true, attachments });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Could not load attachments', 500);
  }
});
