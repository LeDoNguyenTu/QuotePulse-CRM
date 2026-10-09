const BLOOM_BYTES = 1024;
const BLOOM_BITS = BLOOM_BYTES * 8;
const BLOOM_HASHES = 6;
const BLOOM_PREFIX = 'v1:';

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

function decode(value: string) {
  if (!value.startsWith(BLOOM_PREFIX)) return null;
  try {
    const binary = atob(value.slice(BLOOM_PREFIX.length));
    if (binary.length !== BLOOM_BYTES) return null;
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

export function createCompanyBloom(rows: Array<Record<string, unknown>>) {
  const bytes = new Uint8Array(BLOOM_BYTES);
  const companyIds = [...new Set(rows.map((row) => row.company_id).filter((value): value is string => typeof value === 'string' && value.length > 0))].sort();
  for (const companyId of companyIds) {
    for (const position of positions(companyId)) bytes[position >>> 3] |= 1 << (position & 7);
  }
  return `${BLOOM_PREFIX}${encode(bytes)}`;
}

export function companyBloomMayContain(value: string | null | undefined, companyId: string) {
  const bytes = value ? decode(value) : null;
  if (!bytes) return true;
  return positions(companyId).every((position) => (bytes[position >>> 3] & (1 << (position & 7))) !== 0);
}

export function findCompanyRelationships(rows: Array<Record<string, unknown>>, companyId: string) {
  return rows.flatMap((row, offset) => row.company_id === companyId ? [{ row, offset }] : []);
}
