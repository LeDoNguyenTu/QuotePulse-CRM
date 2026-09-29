export const LEGACY_ARCHIVE_SCHEMA = 'quotepulse-legacy-v1';
export const LEGACY_ARCHIVE_CHUNK_ROWS = 250;

export type LegacyTableSpec = { table: string; ownerColumn: 'owner_id'|'created_by'; restoreOrder: number; cursorColumn:string; onConflict:string; readonlyColumns?: string[]; secretColumns?:string[] };

export const LEGACY_ARCHIVE_TABLES: LegacyTableSpec[] = [
  {table:'companies',ownerColumn:'owner_id',restoreOrder:10,cursorColumn:'id',onConflict:'id',readonlyColumns:['search_tsv']},
  {table:'email_templates',ownerColumn:'owner_id',restoreOrder:20,cursorColumn:'id',onConflict:'id'},
  {table:'deals',ownerColumn:'owner_id',restoreOrder:30,cursorColumn:'id',onConflict:'id'},
  {table:'contacts',ownerColumn:'owner_id',restoreOrder:40,cursorColumn:'id',onConflict:'id'},
  {table:'kyc_profiles',ownerColumn:'owner_id',restoreOrder:50,cursorColumn:'id',onConflict:'id'},
  {table:'attachments',ownerColumn:'owner_id',restoreOrder:60,cursorColumn:'id',onConflict:'id'},
  {table:'email_sends',ownerColumn:'created_by',restoreOrder:70,cursorColumn:'id',onConflict:'id',secretColumns:['body_rendered']},
  {table:'uploaded_files',ownerColumn:'owner_id',restoreOrder:80,cursorColumn:'id',onConflict:'id'},
  {table:'uploaded_file_rows',ownerColumn:'owner_id',restoreOrder:90,cursorColumn:'id',onConflict:'id'},
  {table:'uploaded_file_merges',ownerColumn:'owner_id',restoreOrder:100,cursorColumn:'id',onConflict:'id'},
  {table:'job_source_configs',ownerColumn:'owner_id',restoreOrder:110,cursorColumn:'id',onConflict:'id'},
  {table:'job_opportunities',ownerColumn:'owner_id',restoreOrder:120,cursorColumn:'id',onConflict:'id'},
  {table:'email_suppressions',ownerColumn:'owner_id',restoreOrder:130,cursorColumn:'email_normalized',onConflict:'owner_id,email_normalized'},
  {table:'company_attachment_archives',ownerColumn:'owner_id',restoreOrder:140,cursorColumn:'id',onConflict:'id'},
];

export const LEGACY_ARCHIVE_EXCLUDED = ['auth.users','user_settings','email_unsubscribe_tokens','hubspot_property_catalog','sync_state','storage_usage_cache','storage_archive_runs','storage_archive_state','storage_import_state','storage_compaction_state'];

export type LegacyArchivePayload = {format:typeof LEGACY_ARCHIVE_SCHEMA;archive_id:string;workspace_id:string;owner_id:string;table:string;sequence:number;rows:Record<string,unknown>[]};

export function sanitizeArchiveRows(spec: LegacyTableSpec, rows: Record<string,unknown>[]) {
  return rows.map((row)=>Object.fromEntries(Object.entries(row).filter(([key])=>!(spec.readonlyColumns??[]).includes(key)).map(([key,value])=>[key,spec.secretColumns?.includes(key)&&typeof value==='string'?value.replace(/([?&]token=)[^\s&#]+/gi,'$1[redacted]'):value])));
}

export function assertArchivePayload(value: unknown, expected: {archiveId:string;workspaceId:string;ownerId:string;table:string;sequence:number}): asserts value is LegacyArchivePayload {
  const payload=value as Partial<LegacyArchivePayload>;
  if(!payload || payload.format!==LEGACY_ARCHIVE_SCHEMA || payload.archive_id!==expected.archiveId || payload.workspace_id!==expected.workspaceId || payload.owner_id!==expected.ownerId || payload.table!==expected.table || payload.sequence!==expected.sequence || !Array.isArray(payload.rows)) throw new Error('Workspace archive object identity mismatch.');
  const spec=LEGACY_ARCHIVE_TABLES.find((item)=>item.table===expected.table);
  if(!spec) throw new Error('Workspace archive table is not allow-listed.');
  if(payload.rows.length>LEGACY_ARCHIVE_CHUNK_ROWS || payload.rows.some((row)=>row?.[spec.ownerColumn]!==expected.ownerId)) throw new Error('Workspace archive object contains out-of-scope rows.');
}

export function archiveTableSpec(table:string){const spec=LEGACY_ARCHIVE_TABLES.find((item)=>item.table===table);if(!spec)throw new Error('Workspace archive table is not allow-listed.');return spec;}
