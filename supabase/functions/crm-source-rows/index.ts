import { handleOptions, json, errorResponse } from '../_shared/cors.ts';
import { getAdminClient, getUserId } from '../_shared/supabaseAdmin.ts';
import {
  assertWorkbookRowIndexPointer,
  getArchiveJson,
  verifyArchivePayload,
} from '../_shared/r2Archive.ts';

export const MAX_REQUESTED_ROWS = 100;
export const MAX_REQUESTED_HEADERS = 100;

interface WorkbookRowIndex {
  format: 'source-row-index.v1' | 'source-row-index.v2';
  source_import_id: string;
  source_revision_id?: string;
  workspace_id: string;
  headers: string[];
  rows: Array<{ row_number: number; cells: Record<string, string> }>;
}

async function assertMembership(
  admin: ReturnType<typeof getAdminClient>,
  workspaceId: string,
  userId: string,
) {
  const { data, error } = await admin.from('workspace_members').select('workspace_id')
    .eq('workspace_id', workspaceId).eq('user_id', userId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Workspace membership required.');
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  try {
    const userId = await getUserId(req);
    const admin = getAdminClient();
    const body = await req.json() as Record<string, unknown>;
    const workspaceId = String(body.workspace_id ?? '');
    const sourceImportId = String(body.source_import_id ?? '');
    const rowNumbers = Array.isArray(body.row_numbers)
      ? [...new Set(body.row_numbers.map(Number).filter((value) => Number.isInteger(value) && value > 0))]
      : [];
    const headers = Array.isArray(body.headers)
      ? [...new Set(body.headers.map(String).map((value) => value.trim()).filter(Boolean))]
      : [];
    if (!workspaceId || !sourceImportId) return errorResponse('Workspace and source import are required.', 400);
    if (!rowNumbers.length || rowNumbers.length > MAX_REQUESTED_ROWS) return errorResponse('Request between 1 and 100 source rows.', 400);
    if (!headers.length || headers.length > MAX_REQUESTED_HEADERS || headers.some((value) => value.length > 500)) {
      return errorResponse('Request between 1 and 100 valid source headers.', 400);
    }
    await assertMembership(admin, workspaceId, userId);

    const { data: sourceImport, error } = await admin.from('crm_source_imports')
      .select('id,workspace_id,imported_by,source_metadata')
      .eq('id', sourceImportId).eq('workspace_id', workspaceId).maybeSingle();
    if (error) throw error;
    if (!sourceImport) return errorResponse('Source import was not found.', 404);
    const metadata = (sourceImport.source_metadata ?? {}) as Record<string, unknown>;
    const key = String(metadata.row_index_r2_key ?? '');
    const checksum = String(metadata.row_index_r2_sha256 ?? '');
    const latestRevisionId = String(metadata.latest_revision_id ?? '');
    if (!key || !/^[a-f0-9]{64}$/.test(checksum)) return errorResponse('This import has no verified row index.', 404);
    assertWorkbookRowIndexPointer(key, String(sourceImport.imported_by), workspaceId, sourceImportId, latestRevisionId || undefined);
    const payload = await getArchiveJson<WorkbookRowIndex>(key);
    await verifyArchivePayload(JSON.stringify(payload), checksum);
    if (!['source-row-index.v1', 'source-row-index.v2'].includes(payload.format)
      || payload.workspace_id !== workspaceId || payload.source_import_id !== sourceImportId
      || (payload.format === 'source-row-index.v2' && payload.source_revision_id !== latestRevisionId)) {
      throw new Error('Stored workbook row index identity is invalid.');
    }
    const allowedHeaders = new Set(payload.headers);
    if (headers.some((header) => !allowedHeaders.has(header))) return errorResponse('A requested header is outside this source.', 400);
    const requestedRows = new Set(rowNumbers);
    return json({
      ok: true,
      rows: payload.rows.filter((row) => requestedRows.has(row.row_number)).map((row) => ({
        row_number: row.row_number,
        cells: Object.fromEntries(headers.map((header) => [header, row.cells[header] ?? ''])),
      })),
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : String(error), 500);
  }
});
