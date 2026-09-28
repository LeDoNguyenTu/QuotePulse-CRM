import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

export async function fingerprintPst(file: Pick<Blob, 'size' | 'slice'>) {
  const hash = sha256.create();
  const chunkBytes = 8 * 1024 * 1024;
  for (let offset = 0; offset < file.size; offset += chunkBytes) {
    hash.update(new Uint8Array(await file.slice(offset, offset + chunkBytes).arrayBuffer()));
  }
  return bytesToHex(hash.digest());
}
