import { describe, expect, it, vi } from 'vitest';
import { parseR2Analytics, parseR2ListPage, readR2Usage } from './r2Usage.ts';

const config = {
  accountId: 'account-id',
  bucket: 'archive-bucket',
  accessKeyId: 'access-id',
  secretAccessKey: 'secret-key',
  analyticsToken: 'analytics-token',
};

describe('R2 storage usage', () => {
  it('parses the newest analytics sample and includes metadata bytes', () => {
    expect(parseR2Analytics({
      data: { viewer: { accounts: [{ r2StorageAdaptiveGroups: [{
        max: { objectCount: 12, uploadCount: 1, payloadSize: 4_000, metadataSize: 500 },
        dimensions: { datetime: '2026-08-21T12:00:00Z', bucketName: 'archive-bucket' },
      }] }] } },
    }, 'archive-bucket')).toEqual({
      usedBytes: 4_500,
      objectCount: 12,
      measuredAt: '2026-08-21T12:00:00Z',
      source: 'cloudflare-analytics',
    });
  });

  it('parses an inventory page and decodes its continuation token', () => {
    const page = parseR2ListPage(`<?xml version="1.0" encoding="UTF-8"?>
      <ListBucketResult>
        <IsTruncated>true</IsTruncated>
        <NextContinuationToken>next%2Btoken&amp;part</NextContinuationToken>
        <Contents><Key>a</Key><Size>123</Size></Contents>
        <Contents><Key>b</Key><Size>456</Size></Contents>
      </ListBucketResult>`);
    expect(page).toEqual({ usedBytes: 579, objectCount: 2, nextToken: 'next%2Btoken&part' });
  });

  it('falls back to all inventory pages when analytics is unauthorized', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(new Response('{"errors":[{"message":"not authorized"}]}', { status: 403 }))
      .mockResolvedValueOnce(new Response('<ListBucketResult><IsTruncated>true</IsTruncated><NextContinuationToken>page-2</NextContinuationToken><Contents><Size>100</Size></Contents></ListBucketResult>', { status: 200 }))
      .mockResolvedValueOnce(new Response('<ListBucketResult><IsTruncated>false</IsTruncated><Contents><Size>250</Size></Contents><Contents><Size>50</Size></Contents></ListBucketResult>', { status: 200 }));

    await expect(readR2Usage(config, { fetchFn, now: new Date('2026-08-21T12:00:00Z') })).resolves.toEqual({
      usedBytes: 400,
      objectCount: 3,
      measuredAt: '2026-08-21T12:00:00.000Z',
      source: 'r2-inventory',
    });
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(String(fetchFn.mock.calls[2][0])).toContain('continuation-token=page-2');
  });
});
