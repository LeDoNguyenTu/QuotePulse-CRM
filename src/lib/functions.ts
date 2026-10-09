// Typed wrappers around Supabase Edge Function invocations. Each returns the
// function's JSON body (or throws with a useful message). The user's auth token
// is attached automatically by supabase-js.
import { supabase } from './supabase';
import type { CrmExportRequest } from './crm/exportSelection';
import type { ExportScope } from './exportScope';

async function invoke<T>(name: string, body?: unknown): Promise<T> {
  // On a cold page load (notably the OAuth redirect landing on /ms-auth-callback)
  // supabase-js may not have propagated the restored session to the functions
  // client yet, so it would send only the anon key and the Edge Function's
  // getUserId() would reject with "Invalid or expired session". Await session
  // recovery and attach the user's access token explicitly.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const { data, error } = await supabase.functions.invoke<T>(name, {
    body: body ?? {},
    headers: session ? { Authorization: `Bearer ${session.access_token}` } : undefined,
  });
  if (error) {
    // supabase-js wraps non-2xx as FunctionsHttpError; surface any JSON message.
    let detail = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.text === 'function') {
      try {
        detail = await ctx.text();
      } catch {
        /* ignore */
      }
    }
    throw new Error(`${name} failed: ${detail}`);
  }
  return data as T;
}

export interface ImportProgress {
  /** Total deals in HubSpot. null when the count could not be read. */
  deals_in_hubspot: number | null;
  /** Fast local estimate. null when Postgres is too busy to provide one. */
  deals_imported: number | null;
  companies: number | null;
  phase: 'backfill' | 'incremental' | 'properties';
}

export interface IngestResult {
  ok: boolean;
  counts: {
    companies: number;
    deals: number;
    contacts: number;
    attachments: number;
    /** Existing deal snapshots repaired with the full readable property set. */
    properties_backfilled: number;
    skipped_trashed: number;
    /** Already held and unchanged in HubSpot — not re-read. */
    skipped_existing: number;
  };
  /** Hard failures (auth, HubSpot 5xx, DB writes). Always show these. */
  errors: string[];
  /** Recoverable/degraded conditions, e.g. a missing HubSpot scope. */
  warnings: string[];
  /** false when the run hit its wall-time budget; invoke again to resume. */
  done: boolean;
  /** Absent on older deployments of the function. */
  progress?: ImportProgress;
}

export interface RebuildResult {
  ok: boolean;
  mode: 'rebuild';
  done: boolean;
  counts: {
    scanned: number;
    /** Deals re-pointed from a vendor row to their real customer. */
    remapped: number;
    created: number;
    /** Vendor rows moved to the recycle bin. */
    retired: number;
    /** Companies given an industry from their name. */
    industries: number;
  };
  errors: string[];
}

export interface EnrichResult {
  ok: boolean;
  company_id: string;
  enriched_data: unknown;
  errors: string[];
}

export interface CrmCompanyEnrichmentResult {
  ok: boolean;
  results: Array<{ company_id: string; updated_fields: string[] }>;
  errors: Array<{ company_id: string; error: string }>;
  warnings?: string[];
}

export interface JobDiscoveryResult {
  ok: boolean;
  sources_checked: number;
  discovered: number;
  errors: string[];
}

export interface ParseResult {
  ok: boolean;
  attachment_id: string;
  parsed_summary: unknown;
  errors: string[];
}

export interface MsAuthStartResult {
  url: string;
}

export interface CompanyAttachmentsResult {
  attachments: import('./types').Attachment[];
}

export interface DealArchivePropertiesResult {
  properties: Record<string, Record<string, string | null>>;
}

export interface StorageServiceStatus {
  usedBytes?: number;
  limitBytes: number;
  error?: string;
}

export type StorageCompactionState =
  | 'idle'
  | 'cooldown'
  | 'scheduled'
  | 'running'
  | 'retry_wait'
  | 'succeeded'
  | 'failed_closed';

export interface StorageCompactionStatus {
  state: StorageCompactionState;
  requestedAt: string | null;
  scheduledAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  nextRetryAt: string | null;
  attemptCount: number;
  databaseBytesBefore: number | null;
  databaseBytesAfter: number | null;
  dealToastBytesBefore: number | null;
  dealToastBytesAfter: number | null;
  lastError: string | null;
  skipReason: string | null;
}

export interface StorageStatusResult {
  ok: true;
  measuredAt: string;
  database: StorageServiceStatus;
  r2: StorageServiceStatus & {
    objectCount?: number;
    measuredAt?: string;
    source?: 'cloudflare-analytics' | 'r2-inventory';
    cached?: boolean;
  };
  archiveAutomation: {
    status: 'succeeded' | 'degraded' | 'failed';
    pressure: 'warning' | 'high' | 'critical';
    databaseBytes: number;
    ownersProcessed: number;
    dealsArchived: number;
    genericAttachmentsArchived: number;
    error: string | null;
    finishedAt: string;
  } | null;
  snapshots?: {
    totalDeals: number;
    pendingSnapshots: number;
    archivedSnapshots: number;
    error?: never;
  } | {
    error: string;
  };
  compaction: StorageCompactionStatus | { error: string };
}

export type ArchivedLegacyTable = 'companies' | 'deals' | 'contacts';
export type ArchivedCompanyBundleResult = {
  ok: true;
  archive_id: string;
  company_id: string;
  status: 'building';
  read_only: true;
  progress: { objects_indexed: number; total_objects: number };
} | {
  ok: true;
  archive_id: string;
  company_id: string;
  status: 'ready';
  read_only: true;
  progress: { objects_indexed: number; total_objects: number };
  contacts: Array<Record<string, unknown> & { id: string; _archive_cursor: string }>;
  deals: Array<Record<string, unknown> & { id: string; _archive_cursor: string }>;
};
export interface ArchivedBrowseResult {
  ok: true; archive_id: string; table: ArchivedLegacyTable; rows: Array<Record<string, unknown> & { _archive_cursor: string }>;
  cursor: string | null; read_only: true; archived_at: string | null;
  progress: { objects_read: number; total_objects: number; total_rows: number };
}

async function getStorageStatus(): Promise<StorageStatusResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/storage-status`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    },
  });
  if (!response.ok) throw new Error(`storage-status failed: ${await response.text()}`);
  return response.json() as Promise<StorageStatusResult>;
}

export const functions = {
  hubspotIngest: (opts?: { company_id?: string }) =>
    invoke<IngestResult>('hubspot-ingest', opts ?? {}),

  /** Re-derive companies from deal names already in the database. No HubSpot calls. */
  hubspotRebuild: () => invoke<RebuildResult>('hubspot-ingest', { mode: 'rebuild' }),

  enrichKyc: (company_id: string) => invoke<EnrichResult>('enrich-kyc', { company_id }),

  enrichCrmCompanies: (workspace_id: string, company_ids: string[]) =>
    invoke<CrmCompanyEnrichmentResult>('enrich-crm-company', { workspace_id, company_ids }),

  discoverJobs: (company_id: string) =>
    invoke<JobDiscoveryResult>('discover-jobs', { company_id }),

  parseQuote: (attachment_id: string) =>
    invoke<ParseResult>('parse-quote', { attachment_id }),

  companyAttachments: async (company_id: string) =>
    (await invoke<CompanyAttachmentsResult>('company-attachments', { company_id })).attachments,

  dealArchiveProperties: async (deal_ids: string[]) =>
    (await invoke<DealArchivePropertiesResult>('deal-archive-properties', { deal_ids })).properties,

  storageStatus: getStorageStatus,

  msAuthStart: () =>
    invoke<MsAuthStartResult>('ms-auth-start', {
      redirect_uri: import.meta.env.VITE_MS_REDIRECT_URI,
    }),

  msAuthCallback: (code: string, redirect_uri: string, state?: string) =>
    invoke<{ ok: boolean; email: string | null }>('ms-auth-callback', {
      code,
      redirect_uri,
      state,
    }),

  mergeUploadedFile: (file_id: string, policy: { companies: string; contacts: string; deals: string }) =>
    invoke<{ ok: boolean; counts: { created: number; updated: number; failed: number }; errors: string[] }>('uploaded-file-merge', { file_id, policy }),

  workspaceArchive: (body: { action: 'archive'|'restore'|'restore_record'|'dry_run_delete'|'delete'|'status'|'browse'|'record'; workspace_id: string; archive_id?: string; confirmation?: string; table?: ArchivedLegacyTable; cursor?: string; page_size?: number; search?: string; record_id?: string }) =>
    invoke<{ok:boolean;archive_id:string;status:string;table?:string;rows?:number;total_deleted_rows?:number;retained_rows?:number;total_retained_rows?:number;complete?:boolean;eligible?:boolean;deleted?:boolean;verified_objects?:number;message?:string}>('workspace-archive', body),

  browseWorkspaceArchive: (body: { workspace_id: string; archive_id: string; table: ArchivedLegacyTable; cursor?: string; page_size?: number; search?: string }) =>
    invoke<ArchivedBrowseResult>('workspace-archive', { action: 'browse', ...body }),

  getArchivedCompanyBundle: (body: { workspace_id: string; archive_id: string; company_id: string }) =>
    invoke<ArchivedCompanyBundleResult>('workspace-archive', { action: 'company_bundle', ...body }),

  getWorkspaceArchiveRecord: (body: { workspace_id: string; archive_id: string; table: ArchivedLegacyTable; cursor: string; record_id: string }) =>
    invoke<{ ok: true; archive_id: string; table: ArchivedLegacyTable; row: Record<string, unknown>; read_only: true }>('workspace-archive', { action: 'record', ...body }),

  restoreWorkspaceArchiveRecord: (body: { workspace_id: string; archive_id: string; table: ArchivedLegacyTable; cursor: string; record_id: string }) =>
    invoke<{ ok: true; archive_id: string; table: ArchivedLegacyTable; record_id: string; status: 'restored' | 'already_restored' | 'conflict'; results: Array<{ table: string; record_id: string; status: string }> }>('workspace-archive', { action: 'restore_record', ...body }),

  storeCrmWorkbookTemplate: (body: { workspace_id: string; filename: string; mime_type: string; checksum_sha256: string; base64: string }) =>
    invoke<{ ok: true; r2_key: string; r2_sha256: string }>('crm-workbook-template', { action: 'store', ...body }),

  storeCrmWorkbookRowIndex: (body: { workspace_id: string; source_import_id: string; source_revision_id: string; workbook_checksum_sha256: string; template_r2_key: string; template_r2_sha256: string; headers: string[]; mapping: Record<string, unknown>; source_rows: Array<{ row_number: number; cells: Record<string, string> }> }) =>
    invoke<{ ok: true; r2_key: string; r2_sha256: string }>('crm-workbook-template', { action: 'store-index', ...body }),

  getCrmWorkbookTemplate: (workspace_id: string, source_import_id: string, source_revision_id?: string) =>
    invoke<{ ok: true; filename: string; mime_type: string; checksum_sha256: string; base64: string; metadata?: Record<string, unknown> }>('crm-workbook-template', { action: 'get', workspace_id, source_import_id, source_revision_id }),

  getCrmSourceRows: (body: { workspace_id: string; source_import_id: string; row_numbers: number[]; headers: string[] }) =>
    invoke<{ ok: true; rows: Array<{ row_number: number; cells: Record<string, string> }> }>('crm-source-rows', body),

  storeCrmMailboxChunk: (body: { workspace_id: string; mailbox_import_id: string; chunk_index: number; messages: unknown[] }) =>
    invoke<{ ok: true; key: string; checksum: string; count: number }>('crm-mailbox-archive', { action: 'store-chunk', ...body }),

  finalizeCrmMailboxArchive: (body: { workspace_id: string; mailbox_import_id: string; message_count: number; error_count: number; chunks: Array<{ key: string; checksum: string; count: number }> }) =>
    invoke<{ ok: true; archive: { key: string; checksum: string }; contacts_created: number }>('crm-mailbox-archive', { action: 'finalize', ...body }),

  crmRecovery: <T>(body: Record<string, unknown>) => invoke<T>('crm-recovery', body),

};

// Excel export needs the raw bytes, not JSON, so it uses a direct fetch to the
// function endpoint with the user's access token.
export async function exportXlsx(scope: ExportScope): Promise<Blob> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/export-xlsx`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    },
    body: JSON.stringify(scope),
  });
  if (!res.ok) {
    throw new Error(`export-xlsx failed: ${await res.text()}`);
  }
  return res.blob();
}

export async function exportCrmRecords(request: CrmExportRequest): Promise<Blob> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/export-crm-records`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw new Error(`CRM export failed: ${await response.text()}`);
  return response.blob();
}
