// Edge Function: export-xlsx
// Re-runs the dashboard query with the caller's current filters and streams back
// an .xlsx file (exceljs). Returns raw bytes, not JSON.
import { corsHeaders, handleOptions, errorResponse } from '../_shared/cors.ts';
import { getAdminClient, getUserId } from '../_shared/supabaseAdmin.ts';
import ExcelJS from 'npm:exceljs@4.4.0';

type ExportScope = { mode?: 'all' | 'hubspot_activity_range'; from?: string; to?: string };

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  try {
    const userId = await getUserId(req);
    const admin = getAdminClient();
    const scope = ((await safeJson(req)) ?? {}) as ExportScope;

    // The admin client uses the service role, which bypasses RLS — the owner
    // filter must be explicit here or this exports every user's companies.
    let query = admin.from('company_dashboard').select('*').eq('owner_id', userId);
    if (scope.mode === 'hubspot_activity_range') {
      if (!validDate(scope.from) || !validDate(scope.to) || scope.from! > scope.to!) return errorResponse('Choose a valid start and end activity date.', 400);
      query = query.gte('last_deal_at', `${scope.from}T00:00:00.000Z`).lt('last_deal_at', nextUtcDay(scope.to!)!);
    }
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
      { header: 'Last HubSpot activity', key: 'last_deal_at', width: 25 },
      { header: 'Last email status', key: 'last_email_status', width: 16 },
      { header: 'Last email sent', key: 'last_email_sent_at', width: 22 },
    ];
    ws.getRow(1).font = { bold: true };

    for (const r of data ?? []) {
      ws.addRow({
        ...r,
        has_quote: r.has_quote ? 'Yes' : 'No',
        has_kyc: r.has_kyc ? 'Yes' : 'No',
        last_deal_at: r.last_deal_at ? new Date(r.last_deal_at).toISOString() : '',
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
        'Content-Disposition': `attachment; filename="companies-${scope.mode === 'hubspot_activity_range' ? `activity-${scope.from}-to-${scope.to}` : 'all'}.xlsx"`,
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

function nextUtcDay(date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const value = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(value.getTime())) return null;
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString();
}

function validDate(value: string | undefined): value is string { return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !!nextUtcDay(value); }
