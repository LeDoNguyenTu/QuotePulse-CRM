import { handleOptions, json, errorResponse } from '../_shared/cors.ts';
import { getAdminClient, getUserId } from '../_shared/supabaseAdmin.ts';
import {
  assertCrmWorkbookPointer, crmWorkbookRowIndexKey, crmWorkbookTemplateKey, getArchiveJson,
  putVerifiedArchive, sha256Hex, verifyArchivePayload,
} from '../_shared/r2Archive.ts';

export const MAX_WORKBOOK_BYTES = 25 * 1024 * 1024;
export const MAX_ROW_INDEX_BYTES = 25 * 1024 * 1024;

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

    if (action === 'store-index') {
      const sourceImportId = String(body.source_import_id ?? '');
      const sourceRevisionId = String(body.source_revision_id ?? '');
      const templateKey = String(body.template_r2_key ?? '');
      const templateChecksum = String(body.template_r2_sha256 ?? '');
      const workbookChecksum = String(body.workbook_checksum_sha256 ?? '');
      const headers = Array.isArray(body.headers)
        ? [...new Set(body.headers.map(String).map((value) => value.trim()).filter(Boolean))]
        : [];
      const sourceRows = Array.isArray(body.source_rows) ? body.source_rows : [];
      if (!sourceImportId || !sourceRevisionId || !templateKey
        || !/^[a-f0-9]{64}$/.test(templateChecksum) || !/^[a-f0-9]{64}$/.test(workbookChecksum)
        || !headers.length || headers.length > 500 || sourceRows.length > 20000) {
        return errorResponse('A valid source import, headers, and bounded source rows are required.', 400);
      }
      const { data: sourceImport, error } = await admin.from('crm_source_imports')
        .select('id,imported_by,latest_revision,source_metadata').eq('id', sourceImportId).eq('workspace_id', workspaceId)
        .maybeSingle();
      if (error) throw error;
      if (!sourceImport) return errorResponse('Source import was not found for this uploader.', 404);
      const { data: sourceRevision, error: revisionError } = await admin.from('crm_source_revisions')
        .select('id,revision_number,checksum_sha256,source_metadata').eq('id', sourceRevisionId).eq('source_import_id', sourceImportId)
        .eq('workspace_id', workspaceId).eq('imported_by', userId).maybeSingle();
      if (revisionError) throw revisionError;
      if (!sourceRevision) return errorResponse('Source revision was not found for this import.', 404);
      assertCrmWorkbookPointer(templateKey, userId, workspaceId);
      if (sourceRevision.checksum_sha256 !== workbookChecksum) {
        return errorResponse('Workbook checksum does not match this source revision.', 409);
      }
      const { data: pendingArtifact, error: pendingError } = await admin.from('crm_source_revision_artifacts')
        .select('id,template_r2_key,template_r2_sha256,headers,mapping,finalization_status,row_index_r2_key,row_index_r2_sha256')
        .eq('workspace_id', workspaceId).eq('source_import_id', sourceImportId)
        .eq('source_revision_id', sourceRevisionId).eq('created_by', userId).maybeSingle();
      if (pendingError) throw pendingError;
      if (!pendingArtifact) return errorResponse('Pending revision artifact was not found.', 404);
      const storedHeaders = (pendingArtifact.headers as unknown[]).map(String);
      const storedMapping = pendingArtifact.mapping as Record<string, unknown>;
      if (pendingArtifact.template_r2_key !== templateKey || pendingArtifact.template_r2_sha256 !== templateChecksum
        || JSON.stringify(storedHeaders) !== JSON.stringify(headers)) {
        return errorResponse('Revision artifact metadata does not match the committed import.', 409);
      }
      let archived: { key: string; checksum: string };
      if (pendingArtifact.finalization_status === 'ready') {
        archived = { key: String(pendingArtifact.row_index_r2_key), checksum: String(pendingArtifact.row_index_r2_sha256) };
      } else {
        const rows = sourceRows.map((candidate) => {
        const row = candidate as Record<string, unknown>;
        const rowNumber = Number(row.row_number);
        const suppliedCells = row.cells && typeof row.cells === 'object' ? row.cells as Record<string, unknown> : {};
        if (!Number.isInteger(rowNumber) || rowNumber < 1) throw new Error('Source row number is invalid.');
        return {
          row_number: rowNumber,
          cells: Object.fromEntries(storedHeaders.map((header) => [header, String(suppliedCells[header] ?? '')])),
        };
        });
        const payload = {
          format: 'source-row-index.v2',
          source_import_id: sourceImportId,
          source_revision_id: sourceRevisionId,
          workspace_id: workspaceId,
          headers: storedHeaders,
          rows,
        };
        if (new TextEncoder().encode(JSON.stringify(payload)).byteLength > MAX_ROW_INDEX_BYTES) {
          return errorResponse('Workbook row index exceeds the allowed size.', 413);
        }
        archived = await putVerifiedArchive(
          crmWorkbookRowIndexKey(userId, workspaceId, sourceImportId, sourceRevisionId),
          payload,
        );
        const { data: finalizedArtifact, error: artifactError } = await admin.from('crm_source_revision_artifacts').update({
          row_index_r2_key: archived.key,
          row_index_r2_sha256: archived.checksum,
          finalization_status: 'ready',
          finalized_at: new Date().toISOString(),
        }).eq('id', pendingArtifact.id).eq('workspace_id', workspaceId)
          .eq('source_revision_id', sourceRevisionId).eq('finalization_status', 'pending')
          .select('id').maybeSingle();
        if (artifactError) throw artifactError;
        if (!finalizedArtifact) {
          const { data: concurrentlyFinalized, error: concurrentError } = await admin.from('crm_source_revision_artifacts')
            .select('row_index_r2_key,row_index_r2_sha256,finalization_status')
            .eq('id', pendingArtifact.id).eq('workspace_id', workspaceId).maybeSingle();
          if (concurrentError) throw concurrentError;
          if (!concurrentlyFinalized || concurrentlyFinalized.finalization_status !== 'ready') {
            throw new Error('Revision artifact could not be finalized exactly once.');
          }
          archived = {
            key: String(concurrentlyFinalized.row_index_r2_key),
            checksum: String(concurrentlyFinalized.row_index_r2_sha256),
          };
        }
      }
      const revisionMetadata = {
        format: 'source-preserving-crm-import-v5', source_type: 'workbook', headers: storedHeaders, mapping: storedMapping,
        template_checksum_sha256: workbookChecksum,
        template_r2_key: templateKey, template_r2_sha256: templateChecksum,
        row_index_r2_key: archived.key, row_index_r2_sha256: archived.checksum,
      };
      const currentMetadata = (sourceImport.source_metadata ?? {}) as Record<string, unknown>;
      const { error: metadataError } = await admin.from('crm_source_imports').update({
        source_metadata: { ...currentMetadata, ...revisionMetadata, latest_revision_id: sourceRevisionId },
      }).eq('id', sourceImportId).eq('workspace_id', workspaceId)
        .eq('latest_revision', sourceRevision.revision_number);
      if (metadataError) throw metadataError;
      const revisionSourceMetadata = (sourceRevision.source_metadata ?? {}) as Record<string, unknown>;
      const { error: revisionMetadataError } = await admin.from('crm_source_revisions').update({
        source_metadata: { ...revisionSourceMetadata, ...revisionMetadata, artifact_status: 'ready' },
      }).eq('id', sourceRevisionId).eq('source_import_id', sourceImportId)
        .eq('workspace_id', workspaceId).eq('imported_by', userId);
      if (revisionMetadataError) throw revisionMetadataError;
      return json({ ok: true, r2_key: archived.key, r2_sha256: archived.checksum });
    }

    if (action === 'get') {
      const importId = String(body.source_import_id ?? '');
      const revisionId = String(body.source_revision_id ?? '');
      const { data: sourceImport, error } = await admin.from('crm_source_imports')
        .select('id,workspace_id,imported_by,source_metadata').eq('id', importId).eq('workspace_id', workspaceId).maybeSingle();
      if (error) throw error;
      if (!sourceImport) return errorResponse('Workbook import was not found.', 404);
      const metadata = (sourceImport.source_metadata ?? {}) as Record<string, unknown>;
      let artifactMetadata = metadata;
      let key = String(metadata.template_r2_key ?? '');
      let archiveChecksum = String(metadata.template_r2_sha256 ?? '');
      if (revisionId) {
        const { data: artifact, error: artifactError } = await admin.from('crm_source_revision_artifacts')
          .select('template_r2_key,template_r2_sha256,headers,mapping,finalization_status,created_by')
          .eq('workspace_id', workspaceId).eq('source_import_id', importId)
          .eq('source_revision_id', revisionId).maybeSingle();
        if (artifactError) throw artifactError;
        if (!artifact || artifact.finalization_status !== 'ready') {
          return errorResponse('This import revision has not finished preserving its workbook artifact.', 409);
        }
        key = String(artifact.template_r2_key);
        archiveChecksum = String(artifact.template_r2_sha256);
        artifactMetadata = {
          format: 'source-preserving-crm-import-v5',
          headers: artifact.headers,
          mapping: artifact.mapping,
        };
        assertCrmWorkbookPointer(key, String(artifact.created_by), workspaceId);
      }
      if (!key) return errorResponse('This import has no preserved workbook template.', 404);
      if (!revisionId) assertCrmWorkbookPointer(key, String(sourceImport.imported_by), workspaceId);
      const payload = await getArchiveJson<Record<string, unknown>>(key);
      if (/^[a-f0-9]{64}$/.test(archiveChecksum)) await verifyArchivePayload(JSON.stringify(payload), archiveChecksum);
      if (payload.format !== 'quotepulse-crm-workbook-v1') throw new Error('Stored workbook format is invalid.');
      return json({ ok: true, filename: payload.filename, mime_type: payload.mime_type, checksum_sha256: payload.checksum_sha256, base64: payload.base64, metadata: artifactMetadata });
    }
    return errorResponse('Unsupported workbook action.', 400);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : String(error), 500);
  }
});
