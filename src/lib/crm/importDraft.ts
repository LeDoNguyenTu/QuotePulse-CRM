import type { ParsedSheet, ParsedWorkbook } from '../uploadedFileWorkbook';
import type { CrmHeaderMatch, CrmImportMapping } from './importPreview';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

const encoder = new TextEncoder();

function normalizedWorkbookPart(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function buildCrmWorkbookIdentity(filename: string, sheetName: string): string {
  return bytesToHex(sha256(encoder.encode(`${normalizedWorkbookPart(filename)}\n${normalizedWorkbookPart(sheetName)}`)));
}

export function buildCrmSourceRows(sheet: Pick<ParsedSheet, 'headers' | 'rows'>): Array<{
  row_number: number;
  cells: Record<string, string>;
}> {
  return sheet.rows.map((source, index) => ({
    row_number: typeof source.__sourceRowNumber === 'number' ? source.__sourceRowNumber : index + 2,
    cells: Object.fromEntries(sheet.headers.map((header) => [header, String(source[header] ?? '')])),
  }));
}

export interface EmptyCrmImportDraft {
  file: File | null;
  workbook: ParsedWorkbook | null;
  sheetIndex: number;
  mapping: CrmImportMapping;
  headerMatches: CrmHeaderMatch[];
  confirmedHeaders: Set<string>;
  previewPage: number;
}

export function emptyCrmImportDraft(): EmptyCrmImportDraft {
  return {
    file: null,
    workbook: null,
    sheetIndex: 0,
    mapping: {},
    headerMatches: [],
    confirmedHeaders: new Set(),
    previewPage: 1,
  };
}
