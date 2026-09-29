import { describe, expect, it } from 'vitest';
import { inspectOoxmlContainer, parseUploadedWorkbook, parseWorkbookDateSystem } from './uploadedFileWorkbook';

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
