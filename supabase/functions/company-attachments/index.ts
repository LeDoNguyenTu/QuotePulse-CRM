import { errorResponse, handleOptions, json } from '../_shared/cors.ts';
import { getAdminClient, getUserId } from '../_shared/supabaseAdmin.ts';
import { getArchiveJson } from '../_shared/r2Archive.ts';

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
    const { data: quotes, error: quoteError } = await admin
      .from('attachments')
      .select('id, deal_id, hubspot_attachment_id, file_name, file_url, source_type, parsed, parsed_summary, created_at, updated_at, deals!inner(company_id)')
      .eq('owner_id', userId)
      .eq('source_type', 'quote')
      .eq('deals.owner_id', userId)
      .eq('deals.company_id', companyId)
      .order('created_at', { ascending: false });
    if (quoteError) throw quoteError;

    const { data: manifest, error: manifestError } = await admin
      .from('company_attachment_archives')
      .select('r2_key')
      .eq('owner_id', userId)
      .eq('company_id', companyId)
      .maybeSingle();
    if (manifestError) throw manifestError;

    let generic: Attachment[] = [];
    if (manifest?.r2_key) generic = await getArchiveJson<Attachment[]>(manifest.r2_key as string);
    const attachments = [...(quotes ?? []) as Attachment[], ...generic]
      .sort((left, right) => right.created_at.localeCompare(left.created_at));
    return json({ ok: true, attachments });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Could not load attachments', 500);
  }
});
