import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { functions } from '../../lib/functions';
import type { CrmImportMapping, CrmImportPreviewRow } from '../../lib/crm/importPreview';
import { buildWorkbookRowUpdates, type CrmExportRow } from '../../lib/crm/importExport';
import { rewriteWorkbookRows } from '../../lib/crm/workbookRoundTrip';

export interface CrmImportResult { source_import_id: string; database_id: string; row_count: number; created_companies: number; created_contacts: number; created_deals: number; created_activities: number; matched_rows: number }

export function useCrmImports(workspaceId: string) {
  const queryClient = useQueryClient();
  const history = useQuery({ queryKey: ['crm', workspaceId, 'imports'], queryFn: async () => {
    const { data, error } = await (supabase as any).from('crm_source_imports').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(100);
    if (error) throw error; return data ?? [];
  }});
  const indexes = useQuery({ queryKey: ['crm', workspaceId, 'import-indexes'], queryFn: async () => {
    const [companies, contacts] = await Promise.all([
      (supabase as any).from('crm_companies').select('id,name').eq('workspace_id', workspaceId).limit(20000),
      (supabase as any).from('crm_contacts').select('id,email').eq('workspace_id', workspaceId).not('email', 'is', null).limit(20000),
    ]);
    if (companies.error) throw companies.error; if (contacts.error) throw contacts.error;
    return { companies: companies.data ?? [], contacts: contacts.data ?? [] };
  }});
  const commit = useMutation({ mutationFn: async (input: { filename: string; mimeType: string; sheetName: string; checksum: string; sourceRowCount: number; rows: CrmImportPreviewRow[]; headers: string[]; mapping: CrmImportMapping; templateBase64: string }) => {
    const template = await functions.storeCrmWorkbookTemplate({
      workspace_id: workspaceId, filename: input.filename, mime_type: input.mimeType,
      checksum_sha256: input.checksum, base64: input.templateBase64,
    });
    const { data, error } = await (supabase as any).rpc('crm_commit_import_with_activities', {
      p_workspace_id: workspaceId, p_original_filename: input.filename,
      p_sheet_name: input.sheetName, p_checksum_sha256: input.checksum,
      p_source_row_count: input.sourceRowCount, p_rows: input.rows,
    });
    if (error) throw error;
    const result = data as CrmImportResult;
    const { error: metadataError } = await (supabase as any).from('crm_source_imports').update({
      source_metadata: {
        format: 'source-preserving-crm-import-v2', headers: input.headers, mapping: input.mapping,
        template_r2_key: template.r2_key, template_r2_sha256: template.r2_sha256,
        template_checksum_sha256: input.checksum,
      },
    }).eq('id', result.source_import_id).eq('workspace_id', workspaceId);
    if (metadataError) throw metadataError;
    return result;
  }, onSuccess: async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['crm', workspaceId] }),
      queryClient.invalidateQueries({ queryKey: ['crm', workspaceId, 'imports'] }),
    ]);
  }});
  const exportImport = useMutation({ mutationFn: async (sourceImport: any) => {
    const metadata = (sourceImport.source_metadata ?? {}) as Record<string, unknown>;
    const headers = Array.isArray(metadata.headers) ? metadata.headers.map(String) : [];
    const mapping = (metadata.mapping ?? {}) as CrmImportMapping;
    if (!headers.length || metadata.format !== 'source-preserving-crm-import-v2') {
      throw new Error('This older import does not have a preserved workbook template.');
    }
    const template = await functions.getCrmWorkbookTemplate(workspaceId, sourceImport.id);
    const { data: refs, error: refsError } = await (supabase as any).from('crm_source_references')
      .select('source_row_number,company_id,contact_id,deal_id')
      .eq('workspace_id', workspaceId).eq('source_import_id', sourceImport.id);
    if (refsError) throw refsError;
    const ids = (key: string): string[] => [...new Set<string>((refs ?? []).map((row: any) => row[key]).filter(Boolean).map(String))];
    const queryRows = async (table: string, selected: string, values: string[]) => {
      if (!values.length) return [];
      const { data, error } = await (supabase as any).from(table).select(selected).eq('workspace_id', workspaceId).in('id', values);
      if (error) throw error; return data ?? [];
    };
    const [companies, contacts, deals, activityResult] = await Promise.all([
      queryRows('crm_companies', 'id,name,industry,website,domain,phone,address_line_1', ids('company_id')),
      queryRows('crm_contacts', 'id,first_name,last_name,full_name,email,phone,job_title', ids('contact_id')),
      queryRows('crm_deals', 'id,name,stage,amount,currency,last_call_at,follow_up_at', ids('deal_id')),
      (supabase as any).from('crm_activities').select('source_row_number,source_column,body,occurred_at')
        .eq('workspace_id', workspaceId).eq('source_import_id', sourceImport.id).order('created_at'),
    ]);
    if (activityResult.error) throw activityResult.error;
    const byId = (rows: any[]) => new Map(rows.map((row) => [row.id, row]));
    const companyById = byId(companies); const contactById = byId(contacts); const dealById = byId(deals);
    const grouped = new Map<number, CrmExportRow>();
    for (const ref of refs ?? []) {
      const rowNumber = Number(ref.source_row_number);
      const row = grouped.get(rowNumber) ?? { rowNumber, company: null, contact: null, deal: null, activities: [] };
      if (ref.company_id) row.company = companyById.get(ref.company_id) ?? null;
      if (ref.contact_id) row.contact = contactById.get(ref.contact_id) ?? null;
      if (ref.deal_id) row.deal = dealById.get(ref.deal_id) ?? null;
      grouped.set(rowNumber, row);
    }
    for (const activity of activityResult.data ?? []) {
      const row = grouped.get(Number(activity.source_row_number));
      if (row) row.activities.push(activity);
    }
    const binary = atob(template.base64); const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    if (!/\.(xlsx|xlsm)$/i.test(template.filename)) throw new Error('Source-preserving export currently requires an Excel workbook.');
    const updated = rewriteWorkbookRows(bytes, sourceImport.sheet_name, buildWorkbookRowUpdates(headers, mapping, [...grouped.values()]));
    const output = new Uint8Array(updated.byteLength); output.set(updated);
    return { filename: template.filename, blob: new Blob([output.buffer], { type: template.mime_type }) };
  }});
  return { history, indexes, commit, exportImport };
}
