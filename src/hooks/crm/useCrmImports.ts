import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import type { CrmImportPreviewRow } from '../../lib/crm/importPreview';

export interface CrmImportResult { source_import_id: string; database_id: string; row_count: number; created_companies: number; created_contacts: number; created_deals: number; matched_rows: number }

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
  const commit = useMutation({ mutationFn: async (input: { filename: string; sheetName: string; checksum: string; rows: CrmImportPreviewRow[] }) => {
    const { data, error } = await (supabase as any).rpc('crm_commit_import', {
      p_workspace_id: workspaceId, p_original_filename: input.filename,
      p_sheet_name: input.sheetName, p_checksum_sha256: input.checksum, p_rows: input.rows,
    });
    if (error) throw error; return data as CrmImportResult;
  }, onSuccess: async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['crm', workspaceId] }),
      queryClient.invalidateQueries({ queryKey: ['crm', workspaceId, 'imports'] }),
    ]);
  }});
  return { history, indexes, commit };
}
