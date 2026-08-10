import { handleOptions, json, errorResponse } from '../_shared/cors.ts';
import { getAdminClient, getUserId } from '../_shared/supabaseAdmin.ts';

type Mode = 'skip' | 'update_matched' | 'create_unmatched' | 'update_and_create';
type Policy = { companies: Mode; contacts: Mode; deals: Mode };
const allow = new Set<Mode>(['skip', 'update_matched', 'create_unmatched', 'update_and_create']);
const canUpdate = (value: Mode) => value === 'update_matched' || value === 'update_and_create';
const canCreate = (value: Mode) => value === 'create_unmatched' || value === 'update_and_create';
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const email = (value: unknown) => text(value).toLowerCase();
const name = (value: unknown) => text(value).normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toLowerCase().replace(/\s+/g, ' ');

Deno.serve(async (req) => {
  const pre = handleOptions(req); if (pre) return pre;
  try {
    const userId = await getUserId(req); const admin = getAdminClient();
    const body = await req.json() as { file_id?: string; policy?: Policy };
    if (!body.file_id || !body.policy || ![body.policy.companies, body.policy.contacts, body.policy.deals].every((value) => allow.has(value))) return errorResponse('A file and valid merge policies are required.', 400);
    const { data: file, error: fileError } = await admin.from('uploaded_files').select('id,mapping').eq('id', body.file_id).eq('owner_id', userId).single();
    if (fileError || !file) return errorResponse('Uploaded file not found.', 404);
    const [{ data: rows, error: rowError }, { data: companies }, { data: contacts }] = await Promise.all([
      admin.from('uploaded_file_rows').select('id,values').eq('file_id', file.id).eq('owner_id', userId).order('row_number'),
      admin.from('companies').select('id,name_clean').eq('owner_id', userId).is('deleted_at', null),
      admin.from('contacts').select('id,email,company_id').eq('owner_id', userId),
    ]);
    if (rowError) throw rowError;
    const { data: merge, error: mergeError } = await admin.from('uploaded_file_merges').insert({ owner_id: userId, file_id: file.id, policy: body.policy, status: 'running' }).select('id').single();
    if (mergeError || !merge) throw mergeError ?? new Error('Could not create merge record.');
    const mapping = (file.mapping ?? {}) as Record<string, string | null>; let created = 0; let updated = 0; let failed = 0; const errors: string[] = [];
    for (const row of rows ?? []) {
      try {
        const values = row.values as Record<string, unknown>; const companyName = name(mapping.companyName ? values[mapping.companyName] : ''); const contactEmail = email(mapping.email ? values[mapping.email] : ''); const fullName = text(mapping.fullName ? values[mapping.fullName] : `${mapping.firstName ? values[mapping.firstName] ?? '' : ''} ${mapping.lastName ? values[mapping.lastName] ?? '' : ''}`);
        let company = (companies ?? []).find((candidate) => name(candidate.name_clean) === companyName) ?? null;
        if (!company && companyName && canCreate(body.policy.companies)) { const { data, error } = await admin.from('companies').insert({ owner_id: userId, name_clean: text(mapping.companyName ? values[mapping.companyName] : ''), name_raw: text(mapping.companyName ? values[mapping.companyName] : ''), source_priority: 'current' }).select('id,name_clean').single(); if (error) throw error; company = data; created++; }
        const contact = contactEmail ? (contacts ?? []).find((candidate) => email(candidate.email) === contactEmail) ?? null : null;
        if (contact && canUpdate(body.policy.contacts)) { const { error } = await admin.from('contacts').update({ full_name: fullName || null, company_id: company?.id ?? contact.company_id }).eq('id', contact.id).eq('owner_id', userId); if (error) throw error; updated++; }
        if (!contact && contactEmail && company?.id && canCreate(body.policy.contacts)) { const { error } = await admin.from('contacts').insert({ owner_id: userId, company_id: company.id, full_name: fullName || null, email: contactEmail, source: 'manual' }); if (error && error.code !== '23505') throw error; created++; }
        const dealName = text(mapping.dealName ? values[mapping.dealName] : '');
        if (dealName && company?.id && canCreate(body.policy.deals)) { const { error } = await admin.from('deals').insert({ owner_id: userId, company_id: company.id, deal_name_raw: dealName, deal_stage: text(mapping.dealStage ? values[mapping.dealStage] : '') || null, is_archived: false }); if (error) throw error; created++; }
        await admin.from('uploaded_file_rows').update({ merge_result: { ok: true } }).eq('id', row.id).eq('owner_id', userId);
      } catch (e) { failed++; errors.push(`row ${row.id}: ${e instanceof Error ? e.message : String(e)}`); await admin.from('uploaded_file_rows').update({ merge_result: { ok: false, error: errors[errors.length - 1] } }).eq('id', row.id).eq('owner_id', userId); }
    }
    const successful = created + updated; const status = failed === 0 ? 'completed' : successful ? 'partial' : 'failed';
    await admin.from('uploaded_file_merges').update({ status, successful_row_count: successful, counts: { created, updated, failed }, errors, completed_at: new Date().toISOString() }).eq('id', merge.id).eq('owner_id', userId);
    return json({ ok: successful > 0 || failed === 0, file_id: file.id, merge_id: merge.id, counts: { created, updated, failed }, errors });
  } catch (e) { return errorResponse(e instanceof Error ? e.message : String(e), 500); }
});
