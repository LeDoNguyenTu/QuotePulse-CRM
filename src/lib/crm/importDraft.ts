import type { ParsedWorkbook } from '../uploadedFileWorkbook';
import type { CrmHeaderMatch, CrmImportMapping } from './importPreview';

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
