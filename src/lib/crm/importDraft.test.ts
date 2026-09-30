import { describe, expect, it } from 'vitest';
import { emptyCrmImportDraft } from './importDraft';

describe('CRM import draft lifecycle', () => {
  it('returns a fresh empty draft after a completed import', () => {
    const first = emptyCrmImportDraft();
    const second = emptyCrmImportDraft();

    expect(first).toEqual({
      file: null,
      workbook: null,
      sheetIndex: 0,
      mapping: {},
      headerMatches: [],
      confirmedHeaders: new Set(),
      previewPage: 1,
    });
    expect(first.mapping).not.toBe(second.mapping);
    expect(first.headerMatches).not.toBe(second.headerMatches);
    expect(first.confirmedHeaders).not.toBe(second.confirmedHeaders);
  });
});
