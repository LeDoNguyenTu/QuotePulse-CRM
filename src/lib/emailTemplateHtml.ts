export interface PreparedEmailHtml {
  html: string;
  text: string;
  imageReferences: string[];
  unresolvedImages: string[];
}

function decodeReference(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}

function basename(value: string): string {
  const clean = decodeReference(value).replace(/^cid:/i, '').split(/[?#]/, 1)[0].replace(/\\/g, '/');
  return clean.slice(clean.lastIndexOf('/') + 1).toLocaleLowerCase();
}

export function prepareImportedEmailHtml(
  source: string,
  assetUrls: Record<string, string>,
): PreparedEmailHtml {
  const byName = new Map(Object.entries(assetUrls).map(([name, url]) => [basename(name), url]));
  const imageReferences: string[] = [];
  const unresolvedImages: string[] = [];
  let html = source
    .replace(/<\s*(script|iframe|object|embed|form|svg|math)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|iframe|object|embed|form|input|button|textarea|select|option|base|meta|link)\b[^>]*\/?\s*>/gi, '')
    .replace(/\s+on[a-z0-9_-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+srcdoc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, (block) => /expression\s*\(|javascript\s*:|@import/i.test(block) ? '' : block)
    .replace(/\s+style\s*=\s*("[^"]*"|'[^']*')/gi, (attribute) => /expression\s*\(|javascript\s*:|url\s*\(\s*['"]?data:/i.test(attribute) ? '' : attribute);

  html = html.replace(/<img\b[^>]*>/gi, (tag) => {
    const match = tag.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    if (!match) return '';
    const reference = match[1] ?? match[2] ?? match[3] ?? '';
    imageReferences.push(reference);
    const publicUrl = byName.get(basename(reference));
    if (publicUrl) return tag.replace(match[0], `src="${escapeAttribute(publicUrl)}"`);
    if (/^https:\/\//i.test(reference)) return tag;
    unresolvedImages.push(reference);
    return '';
  });

  html = html.replace(/\s+(href|src|action|formaction)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
    (_attribute, name: string, quoted: string, single: string, bare: string) => {
      const value = quoted ?? single ?? bare ?? '';
      return /^(?:javascript|vbscript|data|file):/i.test(value.trim()) ? '' : ` ${name}="${escapeAttribute(value)}"`;
    });

  return { html, text: htmlToPlainText(html), imageReferences, unresolvedImages };
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
