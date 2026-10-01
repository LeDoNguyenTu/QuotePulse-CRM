import { handleOptions, json, errorResponse } from '../_shared/cors.ts';
import { getAdminClient, getUserId } from '../_shared/supabaseAdmin.ts';
import { getArchiveJson, putVerifiedArchive, verifyArchivePayload } from '../_shared/r2Archive.ts';
import {
  assertMailboxArchivePointer, assertMailboxChunks, mailboxArchiveChunkKey,
  mailboxArchiveKey, type MailboxArchiveChunk,
} from '../_shared/crmMailboxArchive.ts';

const MAX_CHUNK_MESSAGES = 100;

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  try {
    const userId = await getUserId(req);
    const body = await req.json() as Record<string, unknown>;
    const action = String(body.action ?? '');
    const workspaceId = String(body.workspace_id ?? '');
    const importId = String(body.mailbox_import_id ?? '');
    const admin = getAdminClient();
    const { data: membership, error: membershipError } = await admin.from('workspace_members')
      .select('workspace_id').eq('workspace_id', workspaceId).eq('user_id', userId).maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) return errorResponse('Workspace membership required.', 403);
    const { data: mailboxImport, error: importError } = await admin.from('crm_mailbox_imports')
      .select('id,workspace_id,file_name,created_by,status').eq('workspace_id', workspaceId).eq('id', importId).maybeSingle();
    if (importError) throw importError;
    if (!mailboxImport || mailboxImport.status !== 'processing') return errorResponse('Processing mailbox import not found.', 404);
    const ownerId = String(mailboxImport.created_by);

    if (action === 'store-chunk') {
      const index = Number(body.chunk_index);
      const messages = Array.isArray(body.messages) ? body.messages : [];
      if (!Number.isInteger(index) || index < 0 || index >= 250 || !messages.length || messages.length > MAX_CHUNK_MESSAGES) {
        return errorResponse('Mailbox archive chunk is invalid.', 400);
      }
      for (const item of messages as Array<Record<string, unknown>>) {
        if (String(item.body_text ?? '').length > 20_000 || String(item.source_key ?? '').length > 200) {
          return errorResponse('Mailbox archive message exceeds its safe limit.', 400);
        }
      }
      const payload = {
        format: 'crm-pst-message-archive.v1', workspace_id: workspaceId,
        mailbox_import_id: importId, source_filename: mailboxImport.file_name, messages,
      };
      const stored = await putVerifiedArchive(mailboxArchiveChunkKey(ownerId, workspaceId, importId, index), payload);
      return json({ ok: true, ...stored, count: messages.length });
    }

    if (action === 'finalize') {
      const chunks = Array.isArray(body.chunks) ? body.chunks as MailboxArchiveChunk[] : [];
      const messageCount = Number(body.message_count);
      const errorCount = Number(body.error_count);
      assertMailboxChunks(chunks, ownerId, workspaceId, importId, messageCount);
      await Promise.all(chunks.map(async (chunk) => {
        assertMailboxArchivePointer(chunk.key, ownerId, workspaceId, importId);
        const payload = await getArchiveJson<Record<string, unknown>>(chunk.key);
        await verifyArchivePayload(JSON.stringify(payload), chunk.checksum);
        if (payload.workspace_id !== workspaceId || payload.mailbox_import_id !== importId
          || !Array.isArray(payload.messages) || payload.messages.length !== chunk.count) {
          throw new Error('Mailbox archive chunk identity or count is invalid.');
        }
      }));
      const manifest = await putVerifiedArchive(mailboxArchiveKey(ownerId, workspaceId, importId), {
        format: 'crm-pst-archive-manifest.v1', workspace_id: workspaceId,
        mailbox_import_id: importId, source_filename: mailboxImport.file_name,
        message_count: messageCount, chunks,
      });
      const { data, error } = await admin.rpc('crm_finalize_mailbox_archive', {
        p_workspace_id: workspaceId, p_import_id: importId, p_archive_r2_key: manifest.key,
        p_archive_sha256: manifest.checksum, p_message_count: messageCount,
        p_error_count: Number.isInteger(errorCount) && errorCount >= 0 ? errorCount : 0,
        p_actor_id: userId,
      });
      if (error) throw error;
      return json({ ok: true, archive: manifest, ...data });
    }
    return errorResponse('Unsupported mailbox archive action.', 400);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : String(error), 500);
  }
});
