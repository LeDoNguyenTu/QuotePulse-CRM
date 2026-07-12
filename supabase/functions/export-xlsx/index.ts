// Edge Function: export-xlsx
// Re-runs the dashboard query with the caller's current filters and streams back
// an .xlsx file (exceljs). Returns raw bytes, not JSON.
import { corsHeaders, handleOptions, errorResponse } from '../_shared/cors.ts';
import { getAdminClient, getUserId } from '../_shared/supabaseAdmin.ts';
import ExcelJS from 'npm:exceljs@4.4.0';

interface Filters {
  search?: string;
  industry?: string;
  source_priority?: string;
  has_quote?: boolean;
  has_kyc?: boolean;
}

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  try {
    const userId = await getUserId(req);
    const admin = getAdminClient();
    const filters = ((await safeJson(req)) ?? {}) as Filters;

    // The admin client uses the service role, which bypasses RLS — the owner
    // filter must be explicit here or this exports every user's companies.
    let query = admin.from('company_dashboard').select('*').eq('owner_id', userId);
    if (filters.search?.trim()) {
      const term = `%${filters.search.trim()}%`;
      query = query.or(
        [
          `name_clean.ilike.${term}`,
          `name_raw.ilike.${term}`,
          `industry.ilike.${term}`,
          `primary_contact_name.ilike.${term}`,
          `primary_contact_email.ilike.${term}`,
        ].join(',')
      );
    }
    if (filters.industry) query = query.eq('industry', filters.industry);
    if (filters.source_priority) query = query.eq('source_priority', filters.source_priority);
    if (filters.has_quote) query = query.eq('has_quote', true);
    if (filters.has_kyc) query = query.eq('has_kyc', true);
    query = query.order('name_clean', { ascending: true }).limit(5000);

    const { data, error } = await query;
    if (error) throw error;

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Companies');
    ws.columns = [
      { header: 'ID', key: 'id', width: 38 },
      { header: 'Company (clean)', key: 'name_clean', width: 30 },
      { header: 'Company (raw)', key: 'name_raw', width: 30 },
      { header: 'Industry', key: 'industry', width: 20 },
      { header: 'Source', key: 'source_priority', width: 12 },
      { header: 'Contact name', key: 'primary_contact_name', width: 24 },
      { header: 'Contact email', key: 'primary_contact_email', width: 28 },
      { header: 'Contact phone', key: 'primary_contact_phone', width: 18 },
      { header: 'Has quote', key: 'has_quote', width: 10 },
      { header: 'Has KYC', key: 'has_kyc', width: 10 },
      { header: 'Last email status', key: 'last_email_status', width: 16 },
      { header: 'Last email sent', key: 'last_email_sent_at', width: 22 },
    ];
    ws.getRow(1).font = { bold: true };

    for (const r of data ?? []) {
      ws.addRow({
        ...r,
        has_quote: r.has_quote ? 'Yes' : 'No',
        has_kyc: r.has_kyc ? 'Yes' : 'No',
        last_email_sent_at: r.last_email_sent_at
          ? new Date(r.last_email_sent_at).toISOString()
          : '',
      });
    }

    const buffer = await wb.xlsx.writeBuffer();
    return new Response(buffer, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="companies.xlsx"',
      },
    });
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : String(e), 500);
  }
});

async function safeJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
