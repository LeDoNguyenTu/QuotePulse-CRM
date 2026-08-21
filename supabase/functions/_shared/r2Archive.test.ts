import { describe, expect, it } from 'vitest';
import {
  archiveObjectHeaders,
  companyAttachmentArchiveKey,
  dealArchiveKey,
  sha256Hex,
  verifyArchivePayload,
} from './r2Archive.ts';

describe('R2 cold archive keys and verification', () => {
  it('stores gzip bytes as an object payload without HTTP auto-decompression metadata', () => {
    expect(archiveObjectHeaders()).toEqual({ 'content-type': 'application/gzip' });
  });

  it('keeps deal archives inside the owner scope', () => {
    expect(dealArchiveKey('owner-a', 'deal-b', '2026-08-18T00:00:00Z'))
      .toMatch(/^owners\/owner-a\/deals\/deal-b\//);
  });

  it('keeps generic attachment manifests inside the owner and company scope', () => {
    expect(companyAttachmentArchiveKey('owner-a', 'company-b'))
      .toBe('owners/owner-a/companies/company-b/generic-attachments.json.gz');
  });

  it('rejects an archive payload with a different checksum', async () => {
    await expect(verifyArchivePayload('{"a":1}', 'wrong-checksum')).rejects.toThrow(/checksum/i);
  });

  it('accepts the checksum generated from the same payload', async () => {
    const payload = '{"a":1}';
    await expect(verifyArchivePayload(payload, await sha256Hex(payload))).resolves.toBeUndefined();
  });
});
