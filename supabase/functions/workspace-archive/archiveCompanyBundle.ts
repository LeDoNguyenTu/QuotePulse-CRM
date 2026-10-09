import { getAdminClient } from '../_shared/supabaseAdmin.ts';
import { assertWorkspaceArchivePointer, getArchiveJson, verifyArchivePayload } from '../_shared/r2Archive.ts';
import { assertArchivePayload } from '../_shared/legacyWorkspaceArchive.ts';
import { createArchiveCursor, projectArchiveRow } from './archiveBrowse.ts';
import { companyBloomMayContain, createCompanyBloom, findCompanyRelationships } from './archiveRelationships.ts';

type ArchiveRow = { id: string; workspace_id: string; status: string };
type ObjectRow = { id: string; table_name: string; sequence: number; r2_key: string; r2_sha256: string; row_count: number; status: string; company_bloom?: string | null };

export const RELATIONSHIP_INDEX_BATCH = 20;
const RELATIONSHIP_TABLES = ['contacts', 'deals'] as const;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertBrowsableArchive(archive: ArchiveRow) {
  if (!['verified', 'deletion_eligible', 'deleted'].includes(archive.status)) throw new Error('Only a verified archive can expose company relationships.');
}

async function loadVerifiedObject(object: ObjectRow, archive: ArchiveRow, userId: string) {
  assertWorkspaceArchivePointer(object.r2_key, userId, archive.workspace_id, archive.id);
  const payload = await getArchiveJson<unknown>(object.r2_key);
  await verifyArchivePayload(JSON.stringify(payload), object.r2_sha256);
  assertArchivePayload(payload, { archiveId: archive.id, workspaceId: archive.workspace_id, ownerId: userId, table: object.table_name, sequence: object.sequence });
  return payload;
}

async function relationshipObjectTotal(admin: ReturnType<typeof getAdminClient>, archive: ArchiveRow) {
  const state = await admin.from('workspace_archive_tables').select('object_count').eq('archive_id', archive.id).eq('workspace_id', archive.workspace_id).in('table_name', [...RELATIONSHIP_TABLES]);
  if (state.error) throw state.error;
  return (state.data ?? []).reduce((sum, row) => sum + Number(row.object_count ?? 0), 0);
}

function bloomContext(object: ObjectRow, archive: ArchiveRow, userId: string) {
  return { archiveId: archive.id, workspaceId: archive.workspace_id, ownerId: userId, table: object.table_name, sequence: object.sequence, checksum: object.r2_sha256 };
}

export async function prepareRelationshipIndex(admin: ReturnType<typeof getAdminClient>, archive: ArchiveRow, userId: string, cursorSecret: string) {
  assertBrowsableArchive(archive);
  const pending = await admin.from('workspace_archive_objects').select('id,table_name,sequence,r2_key,r2_sha256,row_count,status,company_bloom').eq('archive_id', archive.id).eq('workspace_id', archive.workspace_id).in('table_name', [...RELATIONSHIP_TABLES]).eq('status', 'verified').is('company_bloom', null).order('table_name').order('sequence').limit(RELATIONSHIP_INDEX_BATCH);
  if (pending.error) throw pending.error;
  for (const object of (pending.data ?? []) as ObjectRow[]) {
    const payload = await loadVerifiedObject(object, archive, userId);
    const updated = await admin.from('workspace_archive_objects').update({ company_bloom: await createCompanyBloom(payload.rows, cursorSecret, bloomContext(object, archive, userId)) }).eq('id', object.id).eq('archive_id', archive.id).eq('workspace_id', archive.workspace_id).eq('r2_sha256', object.r2_sha256).is('company_bloom', null);
    if (updated.error) throw updated.error;
  }
  const remaining = await admin.from('workspace_archive_objects').select('id', { count: 'exact', head: true }).eq('archive_id', archive.id).eq('workspace_id', archive.workspace_id).in('table_name', [...RELATIONSHIP_TABLES]).eq('status', 'verified').is('company_bloom', null);
  if (remaining.error) throw remaining.error;
  const totalObjects = await relationshipObjectTotal(admin, archive);
  const remainingObjects = Number(remaining.count ?? 0);
  return { ready: remainingObjects === 0, progress: { objects_indexed: Math.max(0, totalObjects - remainingObjects), total_objects: totalObjects } };
}

async function allRelationshipObjects(admin: ReturnType<typeof getAdminClient>, archive: ArchiveRow) {
  const rows: ObjectRow[] = [];
  for (let from = 0; ; from += 1000) {
    const result = await admin.from('workspace_archive_objects').select('id,table_name,sequence,r2_key,r2_sha256,row_count,status,company_bloom').eq('archive_id', archive.id).eq('workspace_id', archive.workspace_id).in('table_name', [...RELATIONSHIP_TABLES]).eq('status', 'verified').order('table_name').order('sequence').range(from, from + 999);
    if (result.error) throw result.error;
    rows.push(...(result.data ?? []) as ObjectRow[]);
    if ((result.data ?? []).length < 1000) break;
  }
  return rows;
}

export async function companyArchiveBundle(
  admin: ReturnType<typeof getAdminClient>,
  archive: ArchiveRow,
  userId: string,
  companyId: string | undefined,
  cursorSecret: string,
) {
  if (!companyId || !uuid.test(companyId)) throw new Error('valid company_id is required');
  const prepared = await prepareRelationshipIndex(admin, archive, userId, cursorSecret);
  if (!prepared.ready) return { ok: true, archive_id: archive.id, company_id: companyId, status: 'building' as const, progress: prepared.progress, read_only: true as const };
  const objects = await allRelationshipObjects(admin, archive);
  const candidates: ObjectRow[] = [];
  for (const object of objects) {
    const context = bloomContext(object, archive, userId);
    if (await companyBloomMayContain(object.company_bloom, companyId, cursorSecret, context)) candidates.push(object);
  }
  const contacts: Record<string, unknown>[] = [];
  const deals: Record<string, unknown>[] = [];
  for (const object of candidates) {
    const payload = await loadVerifiedObject(object, archive, userId);
    for (const match of findCompanyRelationships(payload.rows, companyId)) {
      const table = object.table_name as 'contacts' | 'deals';
      const row = { ...projectArchiveRow(table, match.row), _archive_cursor: await createArchiveCursor(cursorSecret, { archiveId: archive.id, workspaceId: archive.workspace_id, ownerId: userId, table, sequence: object.sequence, offset: match.offset }) };
      (table === 'contacts' ? contacts : deals).push(row);
    }
  }
  contacts.sort((left, right) => String(left.full_name ?? left.email ?? '').localeCompare(String(right.full_name ?? right.email ?? '')));
  deals.sort((left, right) => String(right.hubspot_modified_at ?? right.updated_at ?? '').localeCompare(String(left.hubspot_modified_at ?? left.updated_at ?? '')));
  return { ok: true, archive_id: archive.id, company_id: companyId, status: 'ready' as const, progress: prepared.progress, contacts, deals, read_only: true as const };
}
