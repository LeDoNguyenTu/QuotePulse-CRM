export interface PreparedEmailHtml {
  html: string;
  text: string;
  subject: string;
  imageReferences: string[];
  unresolvedImages: string[];
}

const PRESERVED_IMAGE_SOURCE = 'data-quotepulse-src';

function normalizeHtmlEncoding(value: string): string | null {
  const encoding = value.trim().toLowerCase().replace(/_/g, '-');
  if (['utf-8', 'utf8', 'unicode-1-1-utf-8'].includes(encoding)) return 'utf-8';
  if (['windows-1252', 'cp1252', 'iso-8859-1', 'latin1', 'us-ascii'].includes(encoding)) return 'windows-1252';
  return null;
}

export function decodeEmailHtmlBytes(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes);
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes);
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes);
  }

  const header = new TextDecoder('windows-1252').decode(bytes.subarray(0, 4096));
  const declared = header.match(/charset\s*=\s*["']?\s*([a-z0-9._-]+)/i)?.[1];
  const encoding = declared ? normalizeHtmlEncoding(declared) : null;
  if (encoding) return new TextDecoder(encoding).decode(bytes);

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

function decodeReference(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}

function basename(value: string): string {
  const clean = decodeReference(value).replace(/^cid:/i, '').split(/[?#]/, 1)[0].replace(/\\/g, '/');
  return clean.slice(clean.lastIndexOf('/') + 1).toLocaleLowerCase();
}

export function sanitizeImportedSubject(value: string): string {
  return decodeEntities(value)
    .replace(/(?:\uFFFD|ï¿½)+/g, ' ')
    .replace(/\?{2,}/g, ' ')
    .replace(/^\s*subject\s*:\s*/i, '')
    .replace(/[\u00a0\s]+/g, ' ')
    .trim();
}

function stripOutlookHeaderParagraphs(source: string): { html: string; subject: string } {
  let subject = '';
  let inLeadingHeaders = true;
  let removeFollowingSpacer = false;
  const html = source.replace(/<p\b[^>]*>[\s\S]*?<\/p>/gi, (paragraph) => {
    const text = htmlToPlainText(paragraph).trim();
    const header = inLeadingHeaders ? text.match(/^(sent|subject)\s*:\s*([\s\S]*)$/i) : null;
    if (header) {
      if (header[1].toLowerCase() === 'subject' && !subject) subject = sanitizeImportedSubject(header[2]);
      removeFollowingSpacer = true;
      return '';
    }
    if (removeFollowingSpacer && !text) {
      removeFollowingSpacer = false;
      return '';
    }
    if (text) inLeadingHeaders = false;
    removeFollowingSpacer = false;
    return paragraph;
  });
  return { html, subject };
}

export function prepareImportedEmailHtml(
  source: string,
  assetUrls: Record<string, string>,
): PreparedEmailHtml {
  const byName = new Map(Object.entries(assetUrls).map(([name, url]) => [basename(name), url]));
  const imageReferences: string[] = [];
  const unresolvedImages: string[] = [];
  const outlookHeaders = stripOutlookHeaderParagraphs(source);
  let html = outlookHeaders.html
    .replace(/<\s*(script|iframe|object|embed|form|svg|math)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|iframe|object|embed|form|input|button|textarea|select|option|base|meta|link)\b[^>]*\/?\s*>/gi, '')
    .replace(/\s+on[a-z0-9_-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+srcdoc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, (block) => /expression\s*\(|javascript\s*:|@import/i.test(block) ? '' : block)
    .replace(/\s+style\s*=\s*("[^"]*"|'[^']*')/gi, (attribute) => /expression\s*\(|javascript\s*:|url\s*\(\s*['"]?data:/i.test(attribute) ? '' : attribute);

  html = html.replace(/<img\b[^>]*>/gi, (tag) => {
    const match = tag.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i)
      ?? tag.match(new RegExp(`\\b${PRESERVED_IMAGE_SOURCE}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
    if (!match) return '';
    const reference = match[1] ?? match[2] ?? match[3] ?? '';
    imageReferences.push(reference);
    const publicUrl = byName.get(basename(reference));
    const inactiveTag = tag
      .replace(/\s+src\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(new RegExp(`\\s+${PRESERVED_IMAGE_SOURCE}\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+)`, 'gi'), '');
    const withAttribute = (name: string, value: string) => inactiveTag.replace(/\s*\/?>$/, ` ${name}="${escapeAttribute(value)}">`);
    if (publicUrl) return withAttribute('src', publicUrl);
    if (/^https:\/\//i.test(reference)) return withAttribute('src', reference);
    unresolvedImages.push(reference);
    if (/^data:/i.test(reference)) return '';
    return withAttribute(PRESERVED_IMAGE_SOURCE, reference);
  });

  html = html.replace(/\s+(href|src|action|formaction)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
    (_attribute, name: string, quoted: string, single: string, bare: string) => {
      const value = quoted ?? single ?? bare ?? '';
      return /^(?:javascript|vbscript|data|file):/i.test(value.trim()) ? '' : ` ${name}="${escapeAttribute(value)}"`;
    });

  return { html, text: htmlToPlainText(html), subject: outlookHeaders.subject, imageReferences, unresolvedImages };
}

export function htmlToPlainText(html: string): string {
  return decodeEntities(html
    .replace(/<\s*(style|head)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/\s*(p|div|table|tr|h[1-6]|li)\s*>/gi, '\n')
    .replace(/<\s*\/\s*(td|th)\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (_match, entity: string) => {
    if (entity[0] === '#') {
      const code = entity[1]?.toLowerCase() === 'x' ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    }
    return named[entity.toLowerCase()] ?? '';
  });
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
