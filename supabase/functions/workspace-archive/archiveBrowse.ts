import { archiveTableSpec } from '../_shared/legacyWorkspaceArchive.ts';

export type ArchiveCursorPayload = {
  archiveId: string; workspaceId: string; ownerId: string; table: string; sequence: number; offset: number;
};

const DISPLAY_FIELDS: Record<string, string[]> = {
  companies: ['id', 'name_raw', 'name_clean', 'industry', 'website', 'hubspot_company_id', 'created_at', 'updated_at'],
  deals: ['id', 'company_id', 'hubspot_deal_id', 'deal_name_raw', 'product', 'deal_stage', 'pipeline', 'amount', 'hubspot_created_at', 'created_at', 'updated_at'],
  contacts: ['id', 'company_id', 'hubspot_contact_id', 'full_name', 'email', 'phone', 'role_title', 'created_at', 'updated_at'],
};

function base64UrlEncode(value: string | Uint8Array) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function base64UrlDecode(value: string) {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

async function sign(secret: string, value: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)));
}

export async function createArchiveCursor(secret: string, payload: ArchiveCursorPayload) {
  const encoded = base64UrlEncode(JSON.stringify(payload));
  return `${encoded}.${base64UrlEncode(await sign(secret, encoded))}`;
}

export async function decodeArchiveCursor(secret: string, cursor: string, expected: Omit<ArchiveCursorPayload, 'sequence' | 'offset'>) {
  try {
    const [encoded, signature, extra] = cursor.split('.');
    if (!encoded || !signature || extra) throw new Error();
    const validSignature = base64UrlEncode(await sign(secret, encoded));
    if (validSignature.length !== signature.length) throw new Error();
    let difference = 0;
    for (let index = 0; index < signature.length; index++) difference |= signature.charCodeAt(index) ^ validSignature.charCodeAt(index);
    if (difference !== 0) throw new Error();
    const payload = JSON.parse(base64UrlDecode(encoded)) as ArchiveCursorPayload;
    if (payload.archiveId !== expected.archiveId || payload.workspaceId !== expected.workspaceId || payload.ownerId !== expected.ownerId || payload.table !== expected.table || !Number.isInteger(payload.sequence) || !Number.isInteger(payload.offset) || payload.sequence < 0 || payload.offset < 0) throw new Error();
    return payload;
  } catch { throw new Error('Invalid or expired archive cursor.'); }
}

export function pageArchiveRows(objects: Record<string, unknown>[][], position: { pageSize: number; sequence: number; offset: number }) {
  if (!Number.isInteger(position.pageSize) || position.pageSize < 1 || position.pageSize > 100) throw new Error('Archive page size must be between 1 and 100.');
  const rows: Record<string, unknown>[] = [];
  let sequence = position.sequence;
  let offset = position.offset;
  let objectsRead = 0;
  while (sequence < objects.length && objectsRead < 2 && rows.length < position.pageSize) {
    const object = objects[sequence] ?? [];
    objectsRead++;
    while (offset < object.length && rows.length < position.pageSize) rows.push(object[offset++]);
    if (offset >= object.length) { sequence++; offset = 0; }
  }
  return { rows, objectsRead, next: sequence < objects.length ? { sequence, offset } : null };
}

export function projectArchiveRow(table: string, row: Record<string, unknown>) {
  archiveTableSpec(table);
  const fields = DISPLAY_FIELDS[table];
  if (!fields) throw new Error('Workspace archive table is not browse allow-listed.');
  return Object.fromEntries(fields.filter((field) => field in row).map((field) => [field, row[field]]));
}
