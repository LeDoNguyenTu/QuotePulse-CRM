import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { accountQueryKey } from '../lib/accountQueryScope';
import { matchUploadedRow, type UploadColumnMapping } from '../lib/uploadedFileMapping';
import { useAuth } from './useAuth';

export type UploadedFileRow = { id: string; row_number: number; values: Record<string, unknown>; match_status: 'matched' | 'unmatched' | 'needs_review'; match_reason: string | null; match_target_type: 'company' | 'contact' | null; match_target_id: string | null; match_hubspot_object_id: string | null; merge_result: Record<string, unknown> | null };
export type UploadedFile = { id: string; file_name: string; sheet_name: string; headers: string[]; mapping: UploadColumnMapping; row_count: number; created_at: string; uploaded_file_merges?: { successful_row_count: number; status: string }[] };

export function useUploadedFiles() {
  const { user } = useAuth(); const qc = useQueryClient();
  const list = useQuery<UploadedFile[]>({ queryKey: accountQueryKey(user?.id, ['uploaded-files']), enabled: !!user, queryFn: async () => {
    const { data, error } = await (supabase as any).from('uploaded_files').select('*, uploaded_file_merges(successful_row_count,status)').order('created_at', { ascending: false }); if (error) throw error; return data ?? [];
  }});
  const create = useMutation({ mutationFn: async (input: { fileName: string; mimeType: string; sheetName: string; headers: string[]; mapping: UploadColumnMapping; rows: Record<string, unknown>[] }) => {
    if (!user) throw new Error('Not authenticated');
    const { data: file, error } = await (supabase as any).from('uploaded_files').insert({ file_name: input.fileName, mime_type: input.mimeType || 'application/octet-stream', sheet_name: input.sheetName, headers: input.headers, mapping: input.mapping, row_count: input.rows.length }).select().single(); if (error) throw error;
    for (let start = 0; start < input.rows.length; start += 500) { const { error: rowError } = await (supabase as any).from('uploaded_file_rows').insert(input.rows.slice(start, start + 500).map((values, index) => ({ file_id: file.id, row_number: start + index + 1, values }))); if (rowError) throw rowError; }
    return file as UploadedFile;
  }, onSuccess: () => qc.invalidateQueries({ queryKey: accountQueryKey(user?.id, ['uploaded-files']) }) });
  const remove = useMutation({ mutationFn: async (id: string) => { const { error } = await (supabase as any).from('uploaded_files').delete().eq('id', id); if (error) throw error; }, onSuccess: () => qc.invalidateQueries({ queryKey: accountQueryKey(user?.id, ['uploaded-files']) }) });
  return { list, create, remove };
}

export function useUploadedFile(id: string | undefined) {
  const { user } = useAuth(); const qc = useQueryClient();
  const query = useQuery<{ file: UploadedFile; rows: UploadedFileRow[] }>({ queryKey: accountQueryKey(user?.id, ['uploaded-file', id]), enabled: !!user && !!id, queryFn: async () => {
    const [{ data: file, error: fileError }, { data: rows, error: rowsError }] = await Promise.all([(supabase as any).from('uploaded_files').select('*').eq('id', id).single(), (supabase as any).from('uploaded_file_rows').select('*').eq('file_id', id).order('row_number')]); if (fileError) throw fileError; if (rowsError) throw rowsError; return { file, rows: rows ?? [] };
  }});
  const rematch = useMutation({ mutationFn: async () => {
    if (!query.data) return;
    const [{ data: companies, error: companyError }, { data: contacts, error: contactError }] = await Promise.all([supabase.from('companies').select('id,name_clean,hubspot_company_id'), supabase.from('contacts').select('id,email,full_name,company_id')]); if (companyError) throw companyError; if (contactError) throw contactError;
    for (const row of query.data.rows) { const match = matchUploadedRow(row.values, query.data.file.mapping ?? {}, { companies: (companies ?? []).map((c) => ({ id: c.id, name: c.name_clean })), contacts: (contacts ?? []).map((c) => ({ id: c.id, email: c.email, fullName: c.full_name, companyId: c.company_id })) }); const hubspotId = match.targetType === 'company' ? companies?.find((company) => company.id === match.targetId)?.hubspot_company_id ?? null : null; const { error } = await (supabase as any).from('uploaded_file_rows').update({ match_status: match.status, match_reason: match.reason, match_target_type: match.targetType, match_target_id: match.targetId, match_hubspot_object_id: hubspotId, match_company_id: match.companyId }).eq('id', row.id); if (error) throw error; }
  }, onSuccess: () => qc.invalidateQueries({ queryKey: accountQueryKey(user?.id, ['uploaded-file', id]) }) });
  return { ...query, rematch };
}
