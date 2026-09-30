import { describe, expect, it } from 'vitest';
import { rewriteWorksheetXml } from './workbookRoundTrip';

describe('CRM workbook round trip', () => {
  it('updates mapped cells while preserving worksheet structure and cell style', () => {
    const xml = '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="2"><c r="A2" s="3" t="inlineStr"><is><t>Old company</t></is></c><c r="B2" t="inlineStr"><is><t>Keep me</t></is></c></row></sheetData></worksheet>';
    const updated = rewriteWorksheetXml(xml, new Map([[2, new Map([[1, 'New & improved']])]]));

    expect(updated).toContain('r="A2" s="3" t="inlineStr"');
    expect(updated).toContain('New &amp; improved');
    expect(updated).toContain('Keep me');
  });

  it('adds a previously blank mapped cell without removing other workbook cells', () => {
    const xml = '<worksheet><sheetData><row r="3"><c r="A3"><v>1</v></c></row></sheetData></worksheet>';
    const updated = rewriteWorksheetXml(xml, new Map([[3, new Map([[3, 'Called']])]]));
    expect(updated).toContain('r="C3" t="inlineStr"');
    expect(updated).toContain('<t xml:space="preserve">Called</t>');
    expect(updated).toContain('r="A3"');
  });
});
