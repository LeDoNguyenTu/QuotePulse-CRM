export interface R2UsageConfig {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  analyticsToken?: string;
}

export interface R2Usage {
  usedBytes: number;
  objectCount: number;
  measuredAt: string;
  source: 'cloudflare-analytics' | 'r2-inventory';
}

export interface R2UsageDependencies {
  fetchFn?: typeof fetch;
  now?: Date;
}

interface R2ListPage {
  usedBytes: number;
  objectCount: number;
  nextToken: string | null;
}

const encoder = new TextEncoder();

function number(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function parseR2Analytics(payload: unknown, bucket: string): R2Usage {
  const accounts = (payload as { data?: { viewer?: { accounts?: unknown[] } } })?.data?.viewer?.accounts;
  const groups = (accounts?.[0] as { r2StorageAdaptiveGroups?: unknown[] } | undefined)?.r2StorageAdaptiveGroups;
  const sample = groups?.find((candidate) =>
    (candidate as { dimensions?: { bucketName?: string } }).dimensions?.bucketName === bucket
  ) as { max?: Record<string, unknown>; dimensions?: { datetime?: string } } | undefined;
  if (!sample?.dimensions?.datetime) throw new Error('Cloudflare R2 analytics returned no recent bucket sample.');
  return {
    usedBytes: number(sample.max?.payloadSize) + number(sample.max?.metadataSize),
    objectCount: number(sample.max?.objectCount),
    measuredAt: sample.dimensions.datetime,
    source: 'cloudflare-analytics',
  };
}

function xmlText(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match?.[1]?.replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&apos;', "'") ?? null;
}

export function parseR2ListPage(xml: string): R2ListPage {
  const sizes = [...xml.matchAll(/<Size>(\d+)<\/Size>/gi)].map((match) => number(match[1]));
  const truncated = xmlText(xml, 'IsTruncated')?.toLowerCase() === 'true';
  return {
    usedBytes: sizes.reduce((total, size) => total + size, 0),
    objectCount: sizes.length,
    nextToken: truncated ? xmlText(xml, 'NextContinuationToken') : null,
  };
}

function bytes(value: Uint8Array): ArrayBuffer {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('');
}

async function hmac(key: Uint8Array, value: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey('raw', bytes(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(value)));
}

function hex(value: Uint8Array): string {
  return [...value].map((part) => part.toString(16).padStart(2, '0')).join('');
}

function awsEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

async function inventoryRequest(
  config: R2UsageConfig,
  fetchFn: typeof fetch,
  now: Date,
  continuationToken?: string,
): Promise<Response> {
  const day = now.toISOString().slice(0, 10).replaceAll('-', '');
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const host = `${config.accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${awsEncode(config.bucket)}`;
  const query: Array<[string, string]> = [['list-type', '2'], ['max-keys', '1000']];
  if (continuationToken) query.push(['continuation-token', continuationToken]);
  const canonicalQuery = query
    .map(([key, value]) => `${awsEncode(key)}=${awsEncode(value)}`)
    .sort()
    .join('&');
  const payloadHash = await sha256('');
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = `GET\n${canonicalUri}\n${canonicalQuery}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const scope = `${day}/auto/s3/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${await sha256(canonicalRequest)}`;
  const kDate = await hmac(encoder.encode(`AWS4${config.secretAccessKey}`), day);
  const kRegion = await hmac(kDate, 'auto');
  const kService = await hmac(kRegion, 's3');
  const signature = hex(await hmac(await hmac(kService, 'aws4_request'), stringToSign));
  return fetchFn(`https://${host}${canonicalUri}?${canonicalQuery}`, {
    headers: {
      authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    },
  });
}

async function readAnalytics(config: R2UsageConfig, fetchFn: typeof fetch, now: Date): Promise<R2Usage> {
  if (!config.analyticsToken) throw new Error('Cloudflare analytics token is not configured.');
  const query = `query R2Storage($accountTag: string!, $startDate: Time!, $endDate: Time!, $bucketName: string!) {
    viewer { accounts(filter: { accountTag: $accountTag }) {
      r2StorageAdaptiveGroups(limit: 1, filter: { datetime_geq: $startDate, datetime_leq: $endDate, bucketName: $bucketName }, orderBy: [datetime_DESC]) {
        max { objectCount uploadCount payloadSize metadataSize }
        dimensions { datetime bucketName }
      }
    } }
  }`;
  const response = await fetchFn('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: { authorization: `Bearer ${config.analyticsToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables: {
      accountTag: config.accountId,
      bucketName: config.bucket,
      startDate: new Date(now.getTime() - 48 * 60 * 60 * 1_000).toISOString(),
      endDate: now.toISOString(),
    } }),
  });
  if (!response.ok) throw new Error(`Cloudflare analytics failed (HTTP ${response.status}).`);
  const payload = await response.json();
  if ((payload as { errors?: unknown[] }).errors?.length) throw new Error('Cloudflare analytics rejected the query.');
  return parseR2Analytics(payload, config.bucket);
}

async function readInventory(config: R2UsageConfig, fetchFn: typeof fetch, now: Date): Promise<R2Usage> {
  let continuationToken: string | undefined;
  let usedBytes = 0;
  let objectCount = 0;
  for (let pageNumber = 0; pageNumber < 10_000; pageNumber += 1) {
    const response = await inventoryRequest(config, fetchFn, now, continuationToken);
    if (!response.ok) throw new Error(`R2 inventory failed (HTTP ${response.status}).`);
    const page = parseR2ListPage(await response.text());
    usedBytes += page.usedBytes;
    objectCount += page.objectCount;
    if (!page.nextToken) {
      return { usedBytes, objectCount, measuredAt: now.toISOString(), source: 'r2-inventory' };
    }
    continuationToken = page.nextToken;
  }
  throw new Error('R2 inventory exceeded the safe pagination limit.');
}

export async function readR2Usage(config: R2UsageConfig, dependencies: R2UsageDependencies = {}): Promise<R2Usage> {
  const fetchFn = dependencies.fetchFn ?? fetch;
  const now = dependencies.now ?? new Date();
  try {
    return await readAnalytics(config, fetchFn, now);
  } catch {
    return readInventory(config, fetchFn, now);
  }
}
