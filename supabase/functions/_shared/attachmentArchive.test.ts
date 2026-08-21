import { describe, expect, it } from 'vitest';
import {
  assertCompanyArchivePointer,
  attachmentsForCompany,
  mergeAttachmentRecords,
} from './attachmentArchive.ts';

const row = (id: string, created_at: string) => ({ id, created_at });

describe('company attachment archive safety', () => {
  it('rejects a manifest pointer outside the caller owner and company prefix', () => {
    expect(() => assertCompanyArchivePointer(
      'owners/owner-b/companies/company-a/generic-attachments/x.json.gz',
      'owner-a',
      'company-a',
    )).toThrow(/scope/i);
  });

  it('accepts a versioned pointer in the expected owner and company prefix', () => {
    expect(() => assertCompanyArchivePointer(
      'owners/owner-a/companies/company-a/generic-attachments/version.json.gz',
      'owner-a',
      'company-a',
    )).not.toThrow();
  });

  it('accepts an owner-scoped attachment batch pointer', () => {
    expect(() => assertCompanyArchivePointer(
      'owners/owner-a/attachment-batches/batch-a.json.gz',
      'owner-a',
      'company-a',
    )).not.toThrow();
  });

  it('extracts one company from a shared attachment batch', () => {
    const payload = { companies: [
      { company_id: 'company-a', attachments: [row('a', '2026-08-20T00:00:00Z')] },
      { company_id: 'company-b', attachments: [row('b', '2026-08-21T00:00:00Z')] },
    ] };
    expect(attachmentsForCompany(payload, 'company-b')).toEqual([
      row('b', '2026-08-21T00:00:00Z'),
    ]);
  });

  it('merges archived and still-live rows without duplicates and keeps newest first', () => {
    expect(mergeAttachmentRecords(
      [row('live', '2026-08-21T02:00:00Z'), row('same', '2026-08-21T03:00:00Z')],
      [row('old', '2026-08-20T01:00:00Z'), row('same', '2026-08-19T01:00:00Z')],
    ).map((item) => item.id)).toEqual(['same', 'live', 'old']);
  });
});
