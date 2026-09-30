import type { CrmImportMapping } from './importPreview';

type Entity = Record<string, unknown> | null;
export interface CrmExportRow {
  rowNumber: number;
  company: Entity;
  contact: Entity;
  deal: Entity;
  activities: Array<{ source_column: string | null; body: string; occurred_at: string | null }>;
}

const FIELD_PATHS: Partial<Record<keyof CrmImportMapping, ['company' | 'contact' | 'deal', string]>> = {
  companyName: ['company', 'name'], companyIndustry: ['company', 'industry'],
  companyWebsite: ['company', 'website'], companyDomain: ['company', 'domain'],
  companyPhone: ['company', 'phone'], companyAddress: ['company', 'address_line_1'],
  contactFirstName: ['contact', 'first_name'], contactLastName: ['contact', 'last_name'],
  contactFullName: ['contact', 'full_name'], contactEmail: ['contact', 'email'],
  contactPhone: ['contact', 'phone'], contactJobTitle: ['contact', 'job_title'],
  dealName: ['deal', 'name'], dealStage: ['deal', 'stage'], dealAmount: ['deal', 'amount'],
  dealCurrency: ['deal', 'currency'], dealOwner: ['deal', 'owner_label'],
  lastCallAt: ['deal', 'last_call_at'], followUpAt: ['deal', 'follow_up_at'],
};

function valueForRole(row: CrmExportRow, role: keyof CrmImportMapping, header: string): string | null {
  if (role === 'callLog' || role === 'remarks' || role === 'comments') {
    const activity = [...row.activities].reverse().find((item) => item.source_column === header);
    return activity?.body ?? null;
  }
  if (role === 'activityOccurredAt') {
    // The import intentionally keeps unparseable source dates in the workbook only.
    // Activities receive a system timestamp, so exporting that value would destroy
    // the user's original date text. Leave this source cell untouched.
    return null;
  }
  const path = FIELD_PATHS[role];
  if (!path) return null;
  const entity = row[path[0]];
  const value = entity?.[path[1]];
  return value === null || value === undefined ? null : String(value);
}

export function buildWorkbookRowUpdates(
  headers: string[],
  mapping: CrmImportMapping,
  rows: CrmExportRow[],
): Map<number, Map<number, string>> {
  const roleByHeader = new Map(Object.entries(mapping).flatMap(([role, header]) =>
    header ? [[header, role as keyof CrmImportMapping] as const] : [],
  ));
  return new Map(rows.flatMap((row) => {
    const cells = new Map<number, string>();
    headers.forEach((header, index) => {
      const role = roleByHeader.get(header);
      if (!role) return;
      const value = valueForRole(row, role, header);
      if (value !== null) cells.set(index + 1, value);
    });
    return cells.size ? [[row.rowNumber, cells] as const] : [];
  }));
}
