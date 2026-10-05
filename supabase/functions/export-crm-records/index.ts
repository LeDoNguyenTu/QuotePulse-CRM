import { corsHeaders, errorResponse, handleOptions } from '../_shared/cors.ts';
import { getAdminClient, getUserId } from '../_shared/supabaseAdmin.ts';
import { neutralizeSpreadsheetFormula } from '../_shared/spreadsheetSafety.ts';
import ExcelJS from 'npm:exceljs@4.4.0';

const MAX_EXPORT_ROWS = 5000;

type Entity = 'companies' | 'contacts' | 'deals';
type ExportColumn = { header: string; value: (row: Record<string, unknown>) => unknown };
type ExportSchema = {
  table: string;
  select: string;
  filename: string;
  sourceIdColumn: 'company_id' | 'contact_id' | 'deal_id';
  columns: Record<string, ExportColumn>;
};

const nestedCompany = (row: Record<string, unknown>) => {
  const company = row.company as { name?: string } | Array<{ name?: string }> | null;
  return Array.isArray(company) ? company[0]?.name ?? '' : company?.name ?? '';
};

const EXPORT_SCHEMAS: Record<Entity, ExportSchema> = {
  companies: {
    table: 'crm_companies', select: '*', filename: 'companies', sourceIdColumn: 'company_id',
    columns: {
      name: { header: 'Company', value: (row) => row.name },
      customer_status: { header: 'Customer status', value: (row) => row.customer_status },
      industry: { header: 'Industry', value: (row) => row.industry },
      phone: { header: 'Phone', value: (row) => row.phone },
      website: { header: 'Website', value: (row) => row.website },
      domain: { header: 'Domain', value: (row) => row.domain },
      address_line_1: { header: 'Address line 1', value: (row) => row.address_line_1 },
      address_line_2: { header: 'Address line 2', value: (row) => row.address_line_2 },
      city: { header: 'City', value: (row) => row.city },
      state_region: { header: 'State / region', value: (row) => row.state_region },
      postal_code: { header: 'Postal code', value: (row) => row.postal_code },
      country: { header: 'Country', value: (row) => row.country },
      created_at: { header: 'Created', value: (row) => row.created_at },
      updated_at: { header: 'Updated', value: (row) => row.updated_at },
    },
  },
  contacts: {
    table: 'crm_contacts', select: '*,company:crm_companies(name)', filename: 'contacts', sourceIdColumn: 'contact_id',
    columns: {
      full_name: { header: 'Contact', value: (row) => row.full_name },
      company: { header: 'Company', value: nestedCompany },
      job_title: { header: 'Role', value: (row) => row.job_title },
      email: { header: 'Email', value: (row) => row.email },
      phone: { header: 'Phone', value: (row) => row.phone },
      record_state: { header: 'State', value: (row) => row.record_state },
      is_hidden: { header: 'Visibility', value: (row) => row.is_hidden ? 'Hidden' : 'Visible' },
      duplicate_review: { header: 'Duplicate review', value: (row) => row.duplicate_review_of ? 'Review required' : '' },
      first_name: { header: 'First name', value: (row) => row.first_name },
      last_name: { header: 'Last name', value: (row) => row.last_name },
      created_at: { header: 'Created', value: (row) => row.created_at },
      updated_at: { header: 'Updated', value: (row) => row.updated_at },
    },
  },
  deals: {
    table: 'crm_deals', select: '*,company:crm_companies(name)', filename: 'deals', sourceIdColumn: 'deal_id',
    columns: {
      name: { header: 'Deal', value: (row) => row.name },
      company: { header: 'Company', value: nestedCompany },
      stage: { header: 'Deal stage', value: (row) => row.stage },
      status: { header: 'Status', value: (row) => row.status },
      amount: { header: 'Value', value: (row) => row.amount },
      currency: { header: 'Currency', value: (row) => row.currency },
      follow_up_at: { header: 'Follow up', value: (row) => row.follow_up_at },
      call_outcome: { header: 'Call outcome', value: (row) => row.call_outcome },
      appointment_status: { header: 'Appointment status', value: (row) => row.appointment_status },
      owner_user_id: { header: 'Owner ID', value: (row) => row.owner_user_id },
      last_call_at: { header: 'Last call', value: (row) => row.last_call_at },
      created_at: { header: 'Created', value: (row) => row.created_at },
      updated_at: { header: 'Updated', value: (row) => row.updated_at },
    },
  },
};

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  try {
    const userId = await getUserId(req);
    const body = await req.json() as Record<string, unknown>;
    const workspaceId = requiredString(body.workspace_id, 'Choose a workspace to export.');
    const entity = body.entity as Entity;
    const schema = EXPORT_SCHEMAS[entity];
    if (!schema) return errorResponse('Unknown export entity.', 400);

    const requested = Array.isArray(body.columns) ? body.columns : [];
    if (requested.length === 0) return errorResponse('Choose at least one export column.', 400);
    const columns = requested.map((column) => {
      if (typeof column !== 'string' || !schema.columns[column]) throw new ClientError('Unknown export column.');
      return { id: column, ...schema.columns[column] };
    });
    const format = body.format === 'csv' ? 'csv' : body.format === 'xlsx' ? 'xlsx' : null;
    if (!format) return errorResponse('Choose CSV or Excel format.', 400);

    const admin = getAdminClient();
    const { data: membership, error: membershipError } = await admin
      .from('workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', userId).maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) return errorResponse('Workspace membership required.', 403);

    const scope = (body.scope ?? {}) as Record<string, unknown>;
    let selectedIds: string[] | null = null;
    if (scope.mode === 'selected') {
      selectedIds = Array.isArray(scope.ids) ? scope.ids.filter((id): id is string => typeof id === 'string' && id.length > 0) : [];
      if (selectedIds.length === 0) return errorResponse('Choose at least one record.', 400);
      if (selectedIds.length > MAX_EXPORT_ROWS) return errorResponse('Too many selected records.', 400);
    } else if (scope.mode !== 'all_matching') {
      return errorResponse('Choose selected records or all matching records.', 400);
    }

    const filters = (scope.filters ?? {}) as Record<string, unknown>;
    let sourceIds: string[] | null = null;
    const sourceImportId = optionalString(filters.sourceImportId);
    if (!selectedIds && sourceImportId) {
      const { data: references, error } = await admin.from('crm_source_references')
        .select(schema.sourceIdColumn).eq('workspace_id', workspaceId).eq('source_import_id', sourceImportId)
        .not(schema.sourceIdColumn, 'is', null).limit(MAX_EXPORT_ROWS + 1);
      if (error) throw error;
      sourceIds = [...new Set((references ?? []).map((row) => row[schema.sourceIdColumn]).filter((id): id is string => typeof id === 'string'))];
    }

    let query = admin.from(schema.table).select(schema.select).eq('workspace_id', workspaceId);
    const ids = selectedIds ?? sourceIds;
    if (ids) {
      if (ids.length === 0) return await exportRows([], columns, format, schema.filename);
      query = query.in('id', ids);
    }
    const { data, error } = await query.limit(MAX_EXPORT_ROWS + 1);
    if (error) throw error;
    if ((data?.length ?? 0) > MAX_EXPORT_ROWS) return errorResponse(`Export is limited to ${MAX_EXPORT_ROWS} records. Narrow the filters and try again.`, 400);

    const rows = selectedIds ? data ?? [] : (data ?? []).filter((row) => matchesFilters(entity, row, filters));
    return await exportRows(rows, columns, format, schema.filename);
  } catch (error) {
    if (error instanceof ClientError) return errorResponse(error.message, 400);
    console.error('export-crm-records failed', error);
    return errorResponse('Unable to export CRM records right now.', 500);
  }
});

class ClientError extends Error {}

function requiredString(value: unknown, message: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new ClientError(message);
  return value;
}

function optionalString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalized(value: unknown): string {
  return String(value ?? '').trim().toLocaleLowerCase();
}

function matchesFilters(entity: Entity, row: Record<string, unknown>, filters: Record<string, unknown>): boolean {
  const search = normalized(filters.search);
  const companyName = nestedCompany(row);
  const searchFields = entity === 'companies'
    ? [row.name, row.industry, row.phone, row.website, row.customer_status]
    : entity === 'contacts'
      ? [row.full_name, row.first_name, row.last_name, row.job_title, row.email, row.phone, companyName]
      : [row.name, row.stage, row.call_outcome, row.appointment_status, companyName];
  if (search && !searchFields.some((value) => normalized(value).includes(search))) return false;
  if (optionalString(filters.companyId) && row.company_id !== filters.companyId) return false;
  if (optionalString(filters.industry) && row.industry !== filters.industry) return false;
  if (optionalString(filters.customerStatus) && row.customer_status !== filters.customerStatus) return false;
  if (optionalString(filters.status) && row.status !== filters.status) return false;
  if (optionalString(filters.contactState) && row.record_state !== filters.contactState) return false;
  const visibility = optionalString(filters.contactVisibility);
  if (visibility === 'visible' && row.is_hidden === true) return false;
  if (visibility === 'hidden' && row.is_hidden !== true) return false;
  const review = optionalString(filters.duplicateReview);
  if (review === 'required' && !row.duplicate_review_of) return false;
  if (review === 'clear' && row.duplicate_review_of) return false;
  return true;
}

async function exportRows(
  rows: Array<Record<string, unknown>>,
  columns: Array<{ id: string } & ExportColumn>,
  format: 'csv' | 'xlsx',
  filename: string,
): Promise<Response> {
  const safeRows = rows.map((row) => columns.map((column) => neutralizeSpreadsheetFormula(column.value(row)) ?? ''));
  if (format === 'csv') {
    const lines = [columns.map((column) => csvCell(column.header)), ...safeRows.map((row) => row.map(csvCell))];
    return new Response(`\uFEFF${lines.map((line) => line.join(',')).join('\r\n')}`, {
      headers: { ...corsHeaders, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}.csv"` },
    });
  }
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(filename.slice(0, 31));
  sheet.columns = columns.map((column) => ({ header: column.header, key: column.id, width: Math.min(40, Math.max(14, column.header.length + 4)) }));
  sheet.getRow(1).font = { bold: true };
  safeRows.forEach((values) => sheet.addRow(Object.fromEntries(columns.map((column, index) => [column.id, values[index]]))));
  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}.xlsx"`,
    },
  });
}

function csvCell(value: unknown): string {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}
