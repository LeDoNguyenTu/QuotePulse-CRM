import { unzipSync } from 'fflate';

export type ParsedSheet = { name: string; headers: string[]; rows: Record<string, unknown>[] };
export type ParsedWorkbook = { sheets: ParsedSheet[] };

const MAX_BYTES = 25 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 2048;
const decoder = new TextDecoder();

export function parseWorkbookDateSystem(workbookXml: string): '1900' | '1904' {
  return /\bdate1904\s*=\s*["'](?:1|true)["']/i.test(workbookXml) ? '1904' : '1900';
}

function text(bytes: Uint8Array | undefined): string { return bytes ? decoder.decode(bytes) : ''; }
function parseXml(value: string): Document { return new DOMParser().parseFromString(value, 'application/xml'); }
function nodeText(node: Element | null): string { return node?.textContent ?? ''; }
function cellColumn(ref: string): number { const letters = ref.match(/[A-Z]+/)?.[0] ?? ''; return [...letters].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0); }

export async function parseUploadedWorkbook(file: File): Promise<ParsedWorkbook> {
  if (!/\.(xlsx|xlsm|csv)$/i.test(file.name)) throw new Error('Choose an .xlsx, .xlsm, or .csv file.');
  if (file.size <= 0) throw new Error('The file is empty.');
  if (file.size > MAX_BYTES) throw new Error('The file must be 25 MB or smaller.');
  if (/\.csv$/i.test(file.name)) return csvWorkbook(await file.text());
  const bytes = new Uint8Array(await file.arrayBuffer());
  inspectOoxmlContainer(bytes);
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    throw new Error('The workbook is not a readable Excel Open XML file.');
  }
  if (!entries['[Content_Types].xml'] || !entries['xl/workbook.xml']) {
    throw new Error('The workbook is missing required Excel Open XML files.');
  }
  const shared = parseXml(text(entries['xl/sharedStrings.xml']));
  const strings = Array.from(shared.querySelectorAll('si')).map((node) => node.textContent ?? '');
  const workbookXml = text(entries['xl/workbook.xml']);
  const book = parseXml(workbookXml);
  const dateSystem = parseWorkbookDateSystem(workbookXml);
  const rels = parseXml(text(entries['xl/_rels/workbook.xml.rels']));
  const targets = new Map(Array.from(rels.querySelectorAll('Relationship')).map((r) => [r.getAttribute('Id'), r.getAttribute('Target')]));
  const sheets: ParsedSheet[] = [];
  for (const sheet of Array.from(book.querySelectorAll('sheets > sheet'))) {
    const target = targets.get(sheet.getAttribute('r:id'));
    if (!target) continue;
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
    const xml = parseXml(text(entries[path]));
    const grid = Array.from(xml.querySelectorAll('sheetData > row')).map((row, index) => {
      const values: string[] = [];
      for (const cell of Array.from(row.querySelectorAll('c'))) {
        const column = cellColumn(cell.getAttribute('r') ?? 'A1');
        const value = cell.getAttribute('t') === 's' ? strings[Number(nodeText(cell.querySelector('v')))] ?? '' : nodeText(cell.querySelector('v')) || nodeText(cell.querySelector('is t'));
        values[column - 1] = value;
      }
      return { rowNumber: Number(row.getAttribute('r')) || index + 1, values };
    });
    if (!grid.length) continue;
    sheets.push(makeSheet(sheet.getAttribute('name') ?? 'Sheet', grid, dateSystem));
  }
  if (!sheets.length) throw new Error('No readable worksheet with a header row was found.');
  return { sheets };
}

export function inspectOoxmlContainer(bytes: Uint8Array): void {
  if (bytes.length < 22 || readU32(bytes, 0) !== 0x04034b50) {
    throw new Error('The workbook is not a valid Excel ZIP container.');
  }
  const minimum = Math.max(0, bytes.length - 65_557);
  let end = -1;
  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (readU32(bytes, offset) === 0x06054b50) { end = offset; break; }
  }
  if (end < 0) throw new Error('The workbook ZIP directory is missing.');
  const entries = readU16(bytes, end + 10);
  const directorySize = readU32(bytes, end + 12);
  const directoryOffset = readU32(bytes, end + 16);
  if (entries === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) {
    throw new Error('ZIP64 workbooks are not supported.');
  }
  if (entries === 0 || entries > MAX_ZIP_ENTRIES || directoryOffset + directorySize > end) {
    throw new Error('The workbook ZIP directory exceeds safe limits.');
  }
  let offset = directoryOffset;
  let totalUncompressed = 0;
  for (let index = 0; index < entries; index += 1) {
    if (readU32(bytes, offset) !== 0x02014b50) throw new Error('The workbook ZIP directory is invalid.');
    const flags = readU16(bytes, offset + 8);
    const uncompressed = readU32(bytes, offset + 24);
    const nameLength = readU16(bytes, offset + 28);
    const extraLength = readU16(bytes, offset + 30);
    const commentLength = readU16(bytes, offset + 32);
    if ((flags & 1) !== 0) throw new Error('Encrypted workbooks are not supported.');
    if (uncompressed === 0xffffffff) throw new Error('ZIP64 workbooks are not supported.');
    totalUncompressed += uncompressed;
    if (totalUncompressed > MAX_UNCOMPRESSED_BYTES) {
      throw new Error('The workbook expands beyond the 100 MB safety limit.');
    }
    offset += 46 + nameLength + extraLength + commentLength;
    if (offset > directoryOffset + directorySize) throw new Error('The workbook ZIP directory is invalid.');
  }
}

function readU16(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 > bytes.length) return -1;
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU32(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.length) return -1;
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function csvWorkbook(value: string): ParsedWorkbook {
  const rows = value.replace(/^\uFEFF/, '').split(/\r?\n/).map((line, index) => ({ rowNumber: index + 1, values: line.split(',').map((cell) => cell.trim()) })).filter((row) => row.values.some(Boolean));
  return { sheets: [makeSheet('CSV', rows, '1900')] };
}

function makeSheet(name: string, grid: Array<{ rowNumber: number; values: string[] }>, dateSystem: '1900' | '1904'): ParsedSheet {
  const width = grid.reduce((widest, row) => {
    for (let index = row.values.length - 1; index >= 0; index -= 1) {
      if (String(row.values[index] ?? '').trim()) return Math.max(widest, index + 1);
    }
    return widest;
  }, 0);
  const usedHeaders = new Set<string>();
  const headers = grid[0].values.slice(0, width).map((value) => {
    const base = value.trim();
    if (!base) return '';
    let header = base;
    let suffix = 2;
    while (usedHeaders.has(header.toLowerCase())) {
      header = `${base} (${suffix})`;
      suffix += 1;
    }
    usedHeaders.add(header.toLowerCase());
    return header;
  });
  if (!headers.length || headers.some((header) => !header)) throw new Error(`${name} has a blank header.`);
  if (headers.length > 200 || grid.length - 1 > 20000) throw new Error(`${name} exceeds the upload column or row limit.`);
  const rows = grid.slice(1).filter((row) => row.values.some(Boolean)).map((row) => {
    const record = Object.fromEntries(headers.map((header, index) => [header, String(row.values[index] ?? '').slice(0, 32000)]));
    Object.defineProperties(record, {
      __sourceRowNumber: { value: row.rowNumber, enumerable: false },
      __excelDateSystem: { value: dateSystem, enumerable: false },
    });
    return record;
  });
  return { name, headers, rows };
}
