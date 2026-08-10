import { unzipSync } from 'fflate';

export type ParsedSheet = { name: string; headers: string[]; rows: Record<string, unknown>[] };
export type ParsedWorkbook = { sheets: ParsedSheet[] };

const MAX_BYTES = 25 * 1024 * 1024;
const decoder = new TextDecoder();

function text(bytes: Uint8Array | undefined): string { return bytes ? decoder.decode(bytes) : ''; }
function parseXml(value: string): Document { return new DOMParser().parseFromString(value, 'application/xml'); }
function nodeText(node: Element | null): string { return node?.textContent ?? ''; }
function cellColumn(ref: string): number { const letters = ref.match(/[A-Z]+/)?.[0] ?? ''; return [...letters].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0); }

export async function parseUploadedWorkbook(file: File): Promise<ParsedWorkbook> {
  if (!/\.(xlsx|xlsm|csv)$/i.test(file.name)) throw new Error('Choose an .xlsx, .xlsm, or .csv file.');
  if (file.size > MAX_BYTES) throw new Error('The file must be 25 MB or smaller.');
  if (/\.csv$/i.test(file.name)) return csvWorkbook(await file.text());
  const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const shared = parseXml(text(entries['xl/sharedStrings.xml']));
  const strings = Array.from(shared.querySelectorAll('si')).map((node) => node.textContent ?? '');
  const book = parseXml(text(entries['xl/workbook.xml']));
  const rels = parseXml(text(entries['xl/_rels/workbook.xml.rels']));
  const targets = new Map(Array.from(rels.querySelectorAll('Relationship')).map((r) => [r.getAttribute('Id'), r.getAttribute('Target')]));
  const sheets: ParsedSheet[] = [];
  for (const sheet of Array.from(book.querySelectorAll('sheets > sheet'))) {
    const target = targets.get(sheet.getAttribute('r:id'));
    if (!target) continue;
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
    const xml = parseXml(text(entries[path]));
    const grid = Array.from(xml.querySelectorAll('sheetData > row')).map((row) => {
      const values: string[] = [];
      for (const cell of Array.from(row.querySelectorAll('c'))) {
        const column = cellColumn(cell.getAttribute('r') ?? 'A1');
        const value = cell.getAttribute('t') === 's' ? strings[Number(nodeText(cell.querySelector('v')))] ?? '' : nodeText(cell.querySelector('v')) || nodeText(cell.querySelector('is t'));
        values[column - 1] = value;
      }
      return values;
    });
    if (!grid.length) continue;
    sheets.push(makeSheet(sheet.getAttribute('name') ?? 'Sheet', grid));
  }
  if (!sheets.length) throw new Error('No readable worksheet with a header row was found.');
  return { sheets };
}

function csvWorkbook(value: string): ParsedWorkbook {
  const rows = value.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean).map((line) => line.split(',').map((cell) => cell.trim()));
  return { sheets: [makeSheet('CSV', rows)] };
}

function makeSheet(name: string, grid: string[][]): ParsedSheet {
  const headers = grid[0].map((value) => value.trim());
  if (!headers.length || headers.some((header) => !header)) throw new Error(`${name} has a blank header.`);
  if (new Set(headers.map((header) => header.toLowerCase())).size !== headers.length) throw new Error(`${name} has duplicate headers.`);
  if (headers.length > 200 || grid.length - 1 > 20000) throw new Error(`${name} exceeds the upload column or row limit.`);
  return { name, headers, rows: grid.slice(1).filter((row) => row.some(Boolean)).map((row) => Object.fromEntries(headers.map((header, index) => [header, String(row[index] ?? '').slice(0, 32000)]))) };
}
