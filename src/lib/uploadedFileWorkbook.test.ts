import { describe, expect, it } from 'vitest';
import { parseWorkbookDateSystem } from './uploadedFileWorkbook';

describe('uploaded workbook metadata', () => {
  it('accepts both OOXML boolean encodings for the 1904 date system', () => {
    expect(parseWorkbookDateSystem('<workbook><workbookPr date1904="1"/></workbook>')).toBe('1904');
    expect(parseWorkbookDateSystem('<workbook><workbookPr date1904="true"/></workbook>')).toBe('1904');
    expect(parseWorkbookDateSystem('<workbook><workbookPr date1904="0"/></workbook>')).toBe('1900');
  });
});
