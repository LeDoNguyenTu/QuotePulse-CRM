import { handleOptions, json, errorResponse } from '../_shared/cors.ts';
import { getAdminClient, getUserId } from '../_shared/supabaseAdmin.ts';
import {
  assertCrmWorkbookPointer, crmWorkbookTemplateKey, getArchiveJson,
  putVerifiedArchive, sha256Hex,
} from '../_shared/r2Archive.ts';

export const MAX_WORKBOOK_BYTES = 25 * 1024 * 1024;

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function assertMembership(admin: ReturnType<typeof getAdminClient>, workspaceId: string, userId: string) {
  const { data, error } = await admin.from('workspace_members').select('workspace_id')
    .eq('workspace_id', workspaceId).eq('user_id', userId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Workspace membership required.');
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req); if (preflight) return preflight;
  try {
    const userId = await getUserId(req);
    const admin = getAdminClient();
    const body = await req.json() as Record<string, unknown>;
    const action = String(body.action ?? '');
    const workspaceId = String(body.workspace_id ?? '');
    if (!workspaceId) return errorResponse('A workspace is required.', 400);
    await assertMembership(admin, workspaceId, userId);

    if (action === 'store') {
      const filename = String(body.filename ?? '').trim();
      const base64 = String(body.base64 ?? '');
      const checksum = String(body.checksum_sha256 ?? '');
      if (!filename || filename.length > 500 || !/^[a-f0-9]{64}$/.test(checksum)) {
        return errorResponse('A valid filename and checksum are required.', 400);
      }
      const bytes = decodeBase64(base64);
      if (!bytes.length || bytes.length > MAX_WORKBOOK_BYTES) return errorResponse('Workbook size is outside the allowed range.', 400);
      if (await sha256Hex(bytes) !== checksum) return errorResponse('Workbook checksum does not match its content.', 400);
      const key = crmWorkbookTemplateKey(userId, workspaceId, checksum, filename);
      const archived = await putVerifiedArchive(key, {
        format: 'quotepulse-crm-workbook-v1', filename,
        mime_type: String(body.mime_type ?? 'application/octet-stream'), checksum_sha256: checksum, base64,
      });
      return json({ ok: true, r2_key: archived.key, r2_sha256: archived.checksum });
    }

    if (action === 'get') {
      const importId = String(body.source_import_id ?? '');
      const { data: sourceImport, error } = await admin.from('crm_source_imports')
        .select('id,workspace_id,source_metadata').eq('id', importId).eq('workspace_id', workspaceId).maybeSingle();
      if (error) throw error;
      if (!sourceImport) return errorResponse('Workbook import was not found.', 404);
      const metadata = (sourceImport.source_metadata ?? {}) as Record<string, unknown>;
      const key = String(metadata.template_r2_key ?? '');
      if (!key) return errorResponse('This import has no preserved workbook template.', 404);
      assertCrmWorkbookPointer(key, userId, workspaceId);
      const payload = await getArchiveJson<Record<string, unknown>>(key);
      if (payload.format !== 'quotepulse-crm-workbook-v1') throw new Error('Stored workbook format is invalid.');
      return json({ ok: true, filename: payload.filename, mime_type: payload.mime_type, checksum_sha256: payload.checksum_sha256, base64: payload.base64 });
    }
    return errorResponse('Unsupported workbook action.', 400);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : String(error), 500);
  }
});
