import type { FieldsData } from '@kenjiuno/msgreader';
import { decompressRTF } from '@kenjiuno/decompressrtf';

export const MAX_OUTLOOK_MSG_BYTES = 25 * 1024 * 1024;

const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

export interface ImportedOutlookMessage {
  subject: string;
  html: string;
  text: string;
  images: File[];
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function plainTextHtml(value: string): string {
  return `<div>${escapeHtml(value).replace(/\r?\n/g, '<br>')}</div>`;
}

function replaceCidReference(html: string, contentId: string, fileName: string): string {
  const escaped = contentId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return html.replace(new RegExp(`cid:${escaped}(?=["'\\s>])`, 'gi'), fileName);
}

export function extractEncapsulatedHtml(compressedRtf: Uint8Array | undefined): string {
  if (!compressedRtf?.byteLength) return '';
  const rtf = new TextDecoder('windows-1252').decode(
    new Uint8Array(decompressRTF([...compressedRtf])),
  );
  return [...rtf.matchAll(/\{\\\*\\htmltag\d+\s([\s\S]*?)\}/g)]
    .map((match) => match[1]
      .replace(/\\'([0-9a-f]{2})/gi, (_value, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
      .replace(/\\(?:par|line)\s?/gi, '\n')
      .replace(/\\([{}\\])/g, '$1'))
    .join('')
    .trim();
}

export function materializeOutlookMessage(
  fields: FieldsData,
  readAttachment: (attachment: FieldsData) => { fileName: string; content: Uint8Array },
): ImportedOutlookMessage {
  const text = fields.body?.trim() ?? '';
  let html = fields.bodyHtml?.trim()
    || (fields.html?.byteLength ? new TextDecoder().decode(fields.html).trim() : '')
    || extractEncapsulatedHtml(fields.compressedRtf)
    || (text ? plainTextHtml(text) : '');
  if (!html) throw new Error('The Outlook message does not contain a readable HTML or text body.');

  const images: File[] = [];
  for (const attachment of fields.attachments ?? []) {
    const loaded = readAttachment(attachment);
    const fileName = loaded.fileName || attachment.fileName || 'image';
    const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
    const contentType = IMAGE_TYPES[extension];
    if (!contentType) continue;
    if (attachment.pidContentId) html = replaceCidReference(html, attachment.pidContentId, fileName);
    const bytes = new Uint8Array(loaded.content.byteLength);
    bytes.set(loaded.content);
    images.push(new File([bytes.buffer], fileName, { type: contentType }));
  }

  return { subject: fields.subject?.trim() ?? '', html, text, images };
}

export async function parseOutlookMsg(file: File): Promise<ImportedOutlookMessage> {
  if (!/\.msg$/i.test(file.name)) throw new Error('Choose an Outlook .msg file.');
  if (file.size <= 0 || file.size > MAX_OUTLOOK_MSG_BYTES) {
    throw new Error('The Outlook message must be 25 MB or smaller.');
  }
  try {
    const { default: MsgReader } = await import('@kenjiuno/msgreader');
    const reader = new MsgReader(await file.arrayBuffer());
    return materializeOutlookMessage(reader.getFileData(), (attachment) => reader.getAttachment(attachment));
  } catch (error) {
    if (error instanceof Error && /does not contain|25 MB|Choose an Outlook/.test(error.message)) throw error;
    throw new Error('The Outlook message could not be read. Export it again as .msg and retry.');
  }
}
