import { describe, expect, it, vi } from 'vitest';
import { archiveDealPropertyBatch, persistDealSnapshot } from './dealSnapshotPersistence.ts';

const input = {
  ownerId: 'owner-a',
  hubspotDealId: 'hs-deal-42',
  modifiedAt: '2026-08-26T12:34:56.000Z',
  schemaVersion: 'schema-v3',
  properties: { dealname: 'PRODUCT - CUSTOMER', custom: 'value' },
};

describe('R2-first deal snapshot persistence', () => {
  it('verifies the owner-scoped R2 object before writing a lean database row', async () => {
    const calls: string[] = [];
    const upload = vi.fn(async (key: string, payload: unknown) => {
      calls.push('upload');
      expect(key).toMatch(
        /^owners\/owner-a\/deals\/hs-deal-42\/2026-08-26T12-34-56-000Z-[0-9a-f]{64}\.json\.gz$/,
      );
      expect(payload).toEqual({
        hubspot_deal_id: 'hs-deal-42',
        properties: input.properties,
      });
      return { key, checksum: 'verified-sha256' };
    });
    const persist = vi.fn(async (archive) => {
      calls.push('persist');
      expect(archive).toEqual({
        hubspot_properties: {},
        hubspot_properties_schema_version: 'schema-v3',
        r2_archive_key: expect.stringMatching(
          /^owners\/owner-a\/deals\/hs-deal-42\/2026-08-26T12-34-56-000Z-[0-9a-f]{64}\.json\.gz$/,
        ),
        r2_archive_sha256: 'verified-sha256',
        r2_archived_at: '2026-08-26T12:35:00.000Z',
      });
      return 'database-result';
    });

    await expect(persistDealSnapshot(input, persist, {
      putVerifiedArchive: upload,
      now: () => new Date('2026-08-26T12:35:00.000Z'),
    })).resolves.toBe('database-result');

    expect(calls).toEqual(['upload', 'persist']);
    expect(upload).toHaveBeenCalledOnce();
    expect(persist).toHaveBeenCalledOnce();
  });

  it('does not write to Postgres when R2 upload or verification fails', async () => {
    const persist = vi.fn();
    await expect(persistDealSnapshot(input, persist, {
      putVerifiedArchive: vi.fn().mockRejectedValue(new Error('R2 unavailable')),
      now: () => new Date('2026-08-26T12:35:00.000Z'),
    })).rejects.toThrow('R2 unavailable');
    expect(persist).not.toHaveBeenCalled();
  });

  it('surfaces a database failure after upload so the verified object is only an orphan', async () => {
    const upload = vi.fn().mockResolvedValue({ key: 'owners/owner-a/deals/hs-deal-42/version.json.gz', checksum: 'sha' });
    await expect(persistDealSnapshot(input, vi.fn().mockRejectedValue(new Error('database unavailable')), {
      putVerifiedArchive: upload,
      now: () => new Date('2026-08-26T12:35:00.000Z'),
    })).rejects.toThrow('database unavailable');
    expect(upload).toHaveBeenCalledOnce();
  });

  it('uses the content hash when HubSpot omits the modified timestamp', async () => {
    const upload = vi.fn().mockResolvedValue({ key: 'key', checksum: 'sha' });
    await persistDealSnapshot({ ...input, modifiedAt: null }, vi.fn(), {
      putVerifiedArchive: upload,
      now: () => new Date('2026-08-26T12:35:00.000Z'),
    });
    expect(upload.mock.calls[0][0]).toMatch(
      /^owners\/owner-a\/deals\/hs-deal-42\/unknown-[0-9a-f]{64}\.json\.gz$/,
    );
  });
});

describe('R2-first historic property repair', () => {
  const batchInput = {
    ownerId: 'owner-a',
    schemaVersion: 'schema-v3',
    rows: [
      {
        id: 'db-deal-1',
        hubspotDealId: 'hs-deal-1',
        expectedModifiedAt: '2026-08-26T01:00:00.000Z',
        properties: { dealname: 'ONE', custom: 'first' },
      },
      {
        id: 'db-deal-2',
        hubspotDealId: 'hs-deal-2',
        expectedModifiedAt: null,
        properties: { dealname: 'TWO', custom: 'second' },
      },
    ],
  };

  it('verifies one owner-scoped batch before finalizing compare-and-set metadata', async () => {
    const calls: string[] = [];
    const upload = vi.fn(async (key: string, payload: unknown) => {
      calls.push('upload');
      expect(key).toBe('owners/owner-a/deal-batches/schema-v3-batch-1.json.gz');
      expect(payload).toEqual({ deals: [
        { id: 'db-deal-1', hubspot_deal_id: 'hs-deal-1', properties: batchInput.rows[0].properties },
        { id: 'db-deal-2', hubspot_deal_id: 'hs-deal-2', properties: batchInput.rows[1].properties },
      ] });
      return { key, checksum: 'batch-sha256' };
    });
    const finalize = vi.fn(async (batch) => {
      calls.push('finalize');
      expect(batch).toEqual({
        ownerId: 'owner-a',
        schemaVersion: 'schema-v3',
        r2Key: 'owners/owner-a/deal-batches/schema-v3-batch-1.json.gz',
        r2Sha256: 'batch-sha256',
        rows: [
          { id: 'db-deal-1', hubspot_deal_id: 'hs-deal-1', expected_modified_at: '2026-08-26T01:00:00.000Z' },
          { id: 'db-deal-2', hubspot_deal_id: 'hs-deal-2', expected_modified_at: null },
        ],
      });
      return 2;
    });

    await expect(archiveDealPropertyBatch(batchInput, finalize, {
      putVerifiedArchive: upload,
      batchId: () => 'batch-1',
    })).resolves.toBe(2);
    expect(calls).toEqual(['upload', 'finalize']);
  });

  it('does not finalize when R2 upload or read-back verification fails', async () => {
    const finalize = vi.fn();
    await expect(archiveDealPropertyBatch(batchInput, finalize, {
      putVerifiedArchive: vi.fn().mockRejectedValue(new Error('checksum mismatch')),
      batchId: () => 'batch-1',
    })).rejects.toThrow('checksum mismatch');
    expect(finalize).not.toHaveBeenCalled();
  });

  it('rejects partial finalization so the import cursor cannot advance', async () => {
    await expect(archiveDealPropertyBatch(batchInput, vi.fn().mockResolvedValue(1), {
      putVerifiedArchive: vi.fn().mockResolvedValue({ key: 'key', checksum: 'sha' }),
      batchId: () => 'batch-1',
    })).rejects.toThrow('1 of 2');
  });
});
