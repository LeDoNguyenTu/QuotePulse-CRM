import { unzipSync, zipSync } from 'fflate';

const decoder = new TextDecoder();
const encoder = new TextEncoder();

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function columnName(index: number): string {
  let value = index;
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function inlineCell(reference: string, value: string, style = ''): string {
  return `<c r="${reference}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

export function rewriteWorksheetXml(xml: string, updates: Map<number, Map<number, string>>): string {
  return xml.replace(/<row\b([^>]*)\br="(\d+)"([^>]*)>([\s\S]*?)<\/row>/g, (row, before, rowText, after, contents) => {
    const rowNumber = Number(rowText);
    const cells = updates.get(rowNumber);
    if (!cells?.size) return row;
    let nextContents = contents;
    for (const [column, value] of cells) {
      const reference = `${columnName(column)}${rowNumber}`;
      const cellPattern = new RegExp(`<c\\b([^>]*\\br=["']${reference}["'][^>]*)>[\\s\\S]*?<\\/c>`, 'i');
      const existing = nextContents.match(cellPattern);
      const style = existing?.[1].match(/\bs=(['"])(.*?)\1/i)?.[0];
      const replacement = inlineCell(reference, value, style ? ` ${style}` : '');
      nextContents = existing ? nextContents.replace(cellPattern, replacement) : `${nextContents}${replacement}`;
    }
    return `<row${before}r="${rowText}"${after}>${nextContents}</row>`;
  });
}

function relationshipTarget(relsXml: string, relationshipId: string): string | null {
  const escaped = relationshipId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = relsXml.match(new RegExp(`<Relationship\\b(?=[^>]*\\bId=["']${escaped}["'])(?=[^>]*\\bTarget=["']([^"']+)["'])[^>]*/?>`, 'i'));
  return match?.[1] ?? null;
}

export function rewriteWorkbookRows(bytes: Uint8Array, sheetName: string, updates: Map<number, Map<number, string>>): Uint8Array {
  const entries = unzipSync(bytes);
  const workbookXml = decoder.decode(entries['xl/workbook.xml']);
  const escapedName = sheetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sheet = workbookXml.match(new RegExp(`<sheet\\b(?=[^>]*\\bname=["']${escapedName}["'])[^>]*\\br:id=["']([^"']+)["'][^>]*/?>`, 'i'));
  if (!sheet) throw new Error(`Worksheet "${sheetName}" is missing from the stored workbook.`);
  const relsXml = decoder.decode(entries['xl/_rels/workbook.xml.rels']);
  const target = relationshipTarget(relsXml, sheet[1]);
  if (!target) throw new Error(`Worksheet "${sheetName}" has no workbook relationship.`);
  const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
  const worksheet = entries[path];
  if (!worksheet) throw new Error(`Worksheet "${sheetName}" data is missing from the stored workbook.`);
  entries[path] = encoder.encode(rewriteWorksheetXml(decoder.decode(worksheet), updates));
  return zipSync(entries, { level: 6 });
}
