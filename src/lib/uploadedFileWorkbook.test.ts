// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { zipSync } from 'fflate';
import { inspectOoxmlContainer, parseUploadedWorkbook, parseWorkbookDateSystem } from './uploadedFileWorkbook';

const encoder = new TextEncoder();

function excelColumn(index: number): string {
  let value = index + 1;
  let column = '';
  while (value > 0) {
    value -= 1;
    column = String.fromCharCode(65 + (value % 26)) + column;
    value = Math.floor(value / 26);
  }
  return column;
}

function workbookFile(headers: string[], rows: string[][]): File {
  const xmlValue = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const rowXml = [headers, ...rows].map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, columnIndex) => (
    `<c r="${excelColumn(columnIndex)}${rowIndex + 1}" t="inlineStr"><is><t>${xmlValue(value)}</t></is></c>`
  )).join('')}</row>`).join('');
  const bytes = zipSync({
    '[Content_Types].xml': encoder.encode('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
    'xl/workbook.xml': encoder.encode('<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': encoder.encode('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/worksheets/sheet1.xml': encoder.encode(`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowXml}</sheetData></worksheet>`),
  });
  return new File([bytes], 'fixture.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

describe('uploaded workbook metadata', () => {
  it('accepts both OOXML boolean encodings for the 1904 date system', () => {
    expect(parseWorkbookDateSystem('<workbook><workbookPr date1904="1"/></workbook>')).toBe('1904');
    expect(parseWorkbookDateSystem('<workbook><workbookPr date1904="true"/></workbook>')).toBe('1904');
    expect(parseWorkbookDateSystem('<workbook><workbookPr date1904="0"/></workbook>')).toBe('1900');
  });
});

describe('uploaded workbook safety limits', () => {
  it('rejects empty uploads before parsing', async () => {
    await expect(parseUploadedWorkbook(new File([], 'empty.xlsx'))).rejects.toThrow(/empty/i);
  });

  it('rejects renamed non-ZIP content', () => {
    expect(() => inspectOoxmlContainer(new TextEncoder().encode('not an xlsx'))).toThrow(/ZIP container/i);
  });

  it('rejects a ZIP directory with an excessive entry count', () => {
    const bytes = new Uint8Array(30);
    new DataView(bytes.buffer).setUint32(0, 0x04034b50, true);
    new DataView(bytes.buffer).setUint32(8, 0x06054b50, true);
    new DataView(bytes.buffer).setUint16(18, 2049, true);
    expect(() => inspectOoxmlContainer(bytes)).toThrow(/safe limits/i);
  });
});

describe('uploaded workbook source headers', () => {
  it('ignores trailing empty worksheet columns that contain no source data', async () => {
    const workbook = await parseUploadedWorkbook(workbookFile(
      ['Company', 'Status', '', ''],
      [['Acme', 'Active', '', '']],
    ));

    expect(workbook.sheets[0].headers).toEqual(['Company', 'Status']);
    expect(workbook.sheets[0].rows[0]).toMatchObject({ Company: 'Acme', Status: 'Active' });
  });

  it('keeps duplicate visible headers as deterministic source columns', async () => {
    const workbook = await parseUploadedWorkbook(workbookFile(
      ['Company', 'Status', 'Status '],
      [['Acme', 'Current', 'Previous']],
    ));

    expect(workbook.sheets[0].headers).toEqual(['Company', 'Status', 'Status (2)']);
    expect(workbook.sheets[0].rows[0]).toMatchObject({
      Company: 'Acme',
      Status: 'Current',
      'Status (2)': 'Previous',
    });
  });

  it('still rejects a blank header when its column contains source data', async () => {
    await expect(parseUploadedWorkbook(workbookFile(
      ['Company', '', 'Status'],
      [['Acme', 'must not disappear', 'Active']],
    ))).rejects.toThrow(/blank header/i);
  });
});
