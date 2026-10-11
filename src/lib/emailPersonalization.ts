export interface PersonalizationField {
  key: 'contact_name' | 'company_name' | 'industry';
  label: string;
  token: string;
  example: string;
}

export const PERSONALIZATION_FIELDS: readonly PersonalizationField[] = [
  { key: 'contact_name', label: 'Recipient name', token: '{{contact_name}}', example: 'Jordan Lee' },
  { key: 'company_name', label: 'Company name', token: '{{company_name}}', example: 'Acme Industries' },
  { key: 'industry', label: 'Industry', token: '{{industry}}', example: 'Manufacturing' },
];

const TOKEN = /\{\{\s*(\w+)\s*\}\}/g;

function personalizationKeys(value: string | null | undefined) {
  const keys = new Set<string>();
  for (const match of value?.matchAll(TOKEN) ?? []) {
    keys.add(match[1] === 'customer' ? 'contact_name' : match[1]);
  }
  return keys;
}

export function findMissingHtmlPersonalization(bodyText: string, bodyHtml: string | null) {
  if (!bodyHtml) return [];
  const textKeys = personalizationKeys(bodyText);
  const htmlKeys = personalizationKeys(bodyHtml);
  return PERSONALIZATION_FIELDS.filter((field) => textKeys.has(field.key) && !htmlKeys.has(field.key));
}

export interface HtmlTextSynchronizationResult {
  html: string;
  synchronized: boolean;
}

interface DomBoundary {
  container: Node;
  offset: number;
}

interface MappedCharacter {
  value: string;
  start: DomBoundary;
  end: DomBoundary;
}

const BLOCK_ELEMENTS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DIV', 'FOOTER', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'HEADER', 'LI', 'MAIN', 'NAV', 'P', 'SECTION', 'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD', 'TR',
]);
const IGNORED_ELEMENTS = new Set(['HEAD', 'SCRIPT', 'STYLE', 'TITLE']);

function childBoundary(node: Node, after: boolean): DomBoundary {
  const parent = node.parentNode;
  if (!parent) return { container: node, offset: after ? node.childNodes.length : 0 };
  const offset = Array.prototype.indexOf.call(parent.childNodes, node);
  return { container: parent, offset: offset + (after ? 1 : 0) };
}

function mappedHtmlText(root: Node): MappedCharacter[] {
  const output: MappedCharacter[] = [];
  const appendBreak = (node: Node, after: boolean) => {
    if (!output.length || output[output.length - 1]?.value === '\n') return;
    const boundary = childBoundary(node, after);
    output.push({ value: '\n', start: boundary, end: boundary });
  };
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = node.nodeValue ?? '';
      for (let offset = 0; offset < value.length; offset += 1) {
        output.push({
          value: value[offset],
          start: { container: node, offset },
          end: { container: node, offset: offset + 1 },
        });
      }
      return;
    }
    if (!(node instanceof Element) && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE && node.nodeType !== Node.DOCUMENT_NODE) return;
    if (node instanceof Element && IGNORED_ELEMENTS.has(node.tagName)) return;
    if (node instanceof HTMLBRElement) {
      const start = childBoundary(node, false);
      const end = childBoundary(node, true);
      output.push({ value: '\n', start, end });
      return;
    }
    const isBlock = node instanceof Element && BLOCK_ELEMENTS.has(node.tagName);
    if (isBlock) appendBreak(node, false);
    node.childNodes.forEach(visit);
    if (isBlock) appendBreak(node, true);
  };
  visit(root);
  return output;
}

function normalizeMappedText(input: readonly MappedCharacter[]) {
  const characters: MappedCharacter[] = [];
  let pending: MappedCharacter[] = [];
  const flushWhitespace = () => {
    if (!pending.length || !characters.length) {
      pending = [];
      return;
    }
    const hasLineBreak = pending.some((item) => /[\r\n]/.test(item.value));
    characters.push({
      value: hasLineBreak ? '\n' : ' ',
      start: pending[0].start,
      end: pending[pending.length - 1].end,
    });
    pending = [];
  };
  for (const character of input) {
    if (/\s|\u00a0/.test(character.value)) {
      pending.push(character);
      continue;
    }
    flushWhitespace();
    characters.push(character);
  }
  return characters;
}

function normalizePlainText(value: string) {
  return normalizeMappedText([...value].map((character) => ({
    value: character,
    start: { container: document, offset: 0 },
    end: { container: document, offset: 0 },
  }))).map((character) => character.value).join('');
}

function commonPrefix(left: string, right: string) {
  let length = 0;
  while (length < left.length && length < right.length && left[length] === right[length]) length += 1;
  return length;
}

function commonSuffix(left: string, right: string, prefixLength: number) {
  let length = 0;
  while (
    length < left.length - prefixLength
    && length < right.length - prefixLength
    && left[left.length - 1 - length] === right[right.length - 1 - length]
  ) length += 1;
  return length;
}

function fragmentForText(documentNode: Document, value: string) {
  const fragment = documentNode.createDocumentFragment();
  value.split('\n').forEach((line, index) => {
    if (index > 0) fragment.append(documentNode.createElement('br'));
    if (line) fragment.append(documentNode.createTextNode(line));
  });
  return fragment;
}

/**
 * Applies the user's latest plain-text edit to the matching visible HTML text.
 * It edits DOM text ranges only, so tables, images, links, and unaffected inline
 * formatting remain intact. When the previous backup text is not uniquely
 * present in the HTML, the function refuses to guess and leaves HTML unchanged.
 */
export function synchronizePlainTextToHtml(
  previousText: string,
  nextText: string,
  html: string,
): HtmlTextSynchronizationResult {
  if (!html || previousText === nextText || typeof DOMParser === 'undefined') {
    return { html, synchronized: Boolean(html) };
  }
  const documentNode = new DOMParser().parseFromString(html, 'text/html');
  const mapped = normalizeMappedText(mappedHtmlText(documentNode.body));
  const visibleText = mapped.map((character) => character.value).join('');
  const previous = normalizePlainText(previousText);
  const next = normalizePlainText(nextText);
  const previousLines = previous.split('\n');
  const nextLines = next.split('\n');
  const changedLineIndexes = previousLines.flatMap((line, index) => line === nextLines[index] ? [] : [index]);
  if (previousLines.length === nextLines.length && changedLineIndexes.length > 1) {
    let synchronizedHtml = html;
    for (const index of changedLineIndexes) {
      const lineResult = synchronizePlainTextToHtml(previousLines[index], nextLines[index], synchronizedHtml);
      if (!lineResult.synchronized) return { html, synchronized: false };
      synchronizedHtml = lineResult.html;
    }
    return { html: synchronizedHtml, synchronized: true };
  }
  const firstMatch = visibleText.indexOf(previous);
  if (!previous || firstMatch < 0 || visibleText.indexOf(previous, firstMatch + 1) >= 0) {
    return { html, synchronized: false };
  }

  const prefixLength = commonPrefix(previous, next);
  const suffixLength = commonSuffix(previous, next, prefixLength);
  const oldEnd = previous.length - suffixLength;
  const inserted = next.slice(prefixLength, next.length - suffixLength);
  const startCharacter = mapped[firstMatch + prefixLength];
  const endCharacter = mapped[firstMatch + oldEnd - 1];
  const start = startCharacter?.start ?? mapped[firstMatch + prefixLength - 1]?.end;
  const end = endCharacter?.end ?? start;
  if (!start || !end) return { html, synchronized: false };

  const range = documentNode.createRange();
  range.setStart(start.container, start.offset);
  range.setEnd(end.container, end.offset);
  range.deleteContents();
  range.insertNode(fragmentForText(documentNode, inserted));

  const fullDocument = /<!doctype\s|<html\b/i.test(html);
  return {
    html: fullDocument ? documentNode.documentElement.outerHTML : documentNode.body.innerHTML,
    synchronized: true,
  };
}
