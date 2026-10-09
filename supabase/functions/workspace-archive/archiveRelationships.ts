const BLOOM_BYTES = 1024;
const BLOOM_BITS = BLOOM_BYTES * 8;
const BLOOM_HASHES = 6;
const BLOOM_PREFIX = 'v1:';

export type CompanyBloomContext = {
  archiveId: string;
  workspaceId: string;
  ownerId: string;
  table: string;
  sequence: number;
  checksum: string;
};

function hash32(value: string, seed: number) {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function positions(companyId: string) {
  const first = hash32(companyId, 0x811c9dc5);
  const second = hash32(companyId, 0x9e3779b9) | 1;
  return Array.from({ length: BLOOM_HASHES }, (_, index) => (first + Math.imul(index, second)) >>> 0).map((value) => value % BLOOM_BITS);
}

function encode(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function encodeUrl(bytes: Uint8Array) {
  return encode(bytes).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function sign(secret: string, value: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)));
}

function signaturesMatch(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export function companyBloomContext(context: CompanyBloomContext) {
  return [context.archiveId, context.workspaceId, context.ownerId, context.table, String(context.sequence), context.checksum].join(':');
}

function decode(value: string) {
  const match = /^v1:([A-Za-z0-9+/]{1366}==)\.([A-Za-z0-9_-]{43})$/.exec(value);
  if (!match) return null;
  try {
    const binary = atob(match[1]);
    if (binary.length !== BLOOM_BYTES) return null;
    return { bytes: Uint8Array.from(binary, (character) => character.charCodeAt(0)), encoded: match[1], signature: match[2] };
  } catch {
    return null;
  }
}

export async function createCompanyBloom(rows: Array<Record<string, unknown>>, secret: string, context: CompanyBloomContext) {
  const bytes = new Uint8Array(BLOOM_BYTES);
  const companyIds = [...new Set(rows.map((row) => row.company_id).filter((value): value is string => typeof value === 'string' && value.length > 0))].sort();
  for (const companyId of companyIds) {
    for (const position of positions(companyId)) bytes[position >>> 3] |= 1 << (position & 7);
  }
  const encoded = encode(bytes);
  const payload = `${BLOOM_PREFIX}${encoded}`;
  return `${payload}.${encodeUrl(await sign(secret, `${payload}|${companyBloomContext(context)}`))}`;
}

export async function companyBloomMayContain(value: string | null | undefined, companyId: string, secret: string, context: CompanyBloomContext) {
  const decoded = value ? decode(value) : null;
  if (!decoded) return true;
  const payload = `${BLOOM_PREFIX}${decoded.encoded}`;
  const expected = encodeUrl(await sign(secret, `${payload}|${companyBloomContext(context)}`));
  if (!signaturesMatch(decoded.signature, expected)) return true;
  return positions(companyId).every((position) => (decoded.bytes[position >>> 3] & (1 << (position & 7))) !== 0);
}

export function findCompanyRelationships(rows: Array<Record<string, unknown>>, companyId: string) {
  return rows.flatMap((row, offset) => row.company_id === companyId ? [{ row, offset }] : []);
}
