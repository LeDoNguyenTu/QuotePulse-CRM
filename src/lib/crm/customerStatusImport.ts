import type { ParsedWorkbook } from '../uploadedFileWorkbook';

function normalizedSourcePart(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function normalizeImportedCompanyName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .toLowerCase();
}

function isSupportCustomerWorkbook(filename: string, workbook?: ParsedWorkbook): boolean {
  const normalizedFilename = normalizedSourcePart(filename);
  if (/support\s+customers?/.test(normalizedFilename)) return true;
  const names = workbook?.sheets.map((sheet) => normalizedSourcePart(sheet.name)) ?? [];
  return names.some((name) => /^active customers?$/.test(name))
    && names.some((name) => /^inactive customers?$/.test(name));
}

export function inferCustomerStatusFromSource(filename: string, sheetName: string): string | null {
  const normalizedFilename = normalizedSourcePart(filename);
  const normalizedSheet = normalizedSourcePart(sheetName);
  if (isSupportCustomerWorkbook(filename)) {
    if (/^inactive customers?$/.test(normalizedSheet)) return 'Former Customer';
    if (/^active customers?$/.test(normalizedSheet)) return 'Maintenance Customer';
  }
  if (/inactive/.test(normalizedSheet)) return 'Former Customer';
  if (/am[cp]|maintenance/.test(normalizedSheet) || /\bam[cp]\b|maintenance/.test(normalizedFilename)) {
    return 'Maintenance Customer';
  }
  if (/active/.test(normalizedSheet)) return 'Current Customer';
  return null;
}

function companyNameHeader(headers: string[], supportWorkbook: boolean): string | null {
  const exact = headers.find((header) => /^(company name|company|account)$/i.test(header.trim()));
  if (exact) return exact;
  return supportWorkbook ? headers.find((header) => /^name$/i.test(header.trim())) ?? null : null;
}

export function buildCustomerStatusReviewIndex(
  filename: string,
  workbook: ParsedWorkbook,
): Map<string, string> {
  if (!isSupportCustomerWorkbook(filename, workbook)) return new Map();
  const occurrences = new Map<string, Array<{ sheetName: string; status: string; rowSignature: string }>>();
  const explicitStatusConflicts = new Map<string, string>();

  for (const sheet of workbook.sheets) {
    const status = inferCustomerStatusFromSource(filename, sheet.name);
    const header = companyNameHeader(sheet.headers, true);
    const statusHeader = sheet.headers.find((candidate) => /^customer status$/i.test(candidate.trim())) ?? null;
    if (!status || !header) continue;
    for (const row of sheet.rows) {
      const name = String(row[header] ?? '').trim();
      const normalizedName = normalizeImportedCompanyName(name);
      if (!normalizedName) continue;
      const explicitStatus = statusHeader ? String(row[statusHeader] ?? '').trim() : '';
      if (explicitStatus && normalizedSourcePart(explicitStatus) !== normalizedSourcePart(status)) {
        explicitStatusConflicts.set(
          normalizedName,
          `Customer Status "${explicitStatus}" conflicts with worksheet ${sheet.name}.`,
        );
      }
      const entries = occurrences.get(normalizedName) ?? [];
      entries.push({ sheetName: sheet.name, status, rowSignature: JSON.stringify(row) });
      occurrences.set(normalizedName, entries);
    }
  }

  const review = new Map<string, string>(explicitStatusConflicts);
  for (const [normalizedName, entries] of occurrences) {
    const statuses = new Set(entries.map((entry) => entry.status));
    if (statuses.size > 1) {
      review.set(normalizedName, 'Name appears in both Active and Inactive customer worksheets.');
      continue;
    }
    if (entries.length > 1 && new Set(entries.map((entry) => entry.rowSignature)).size > 1) {
      review.set(normalizedName, `Name appears more than once in worksheet ${entries[0].sheetName} with different details.`);
    }
  }
  return review;
}
