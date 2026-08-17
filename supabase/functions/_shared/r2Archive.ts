type R2Config = {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function env(name: string): string | undefined {
  return (globalThis as { Deno?: { env?: { get: (key: string) => string | undefined } } }).Deno?.env?.get(name);
}

function requiredConfig(): R2Config {
  const accountId = env('R2_ACCOUNT_ID');
  const bucket = env('R2_BUCKET');
  const accessKeyId = env('R2_ACCESS_KEY_ID');
  const secretAccessKey = env('R2_SECRET_ACCESS_KEY');
  if (!accountId || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error('R2 archive is not configured. Set the four R2_* Edge Function secrets.');
  }
  return { accountId, bucket, accessKeyId, secretAccessKey };
}

export function dealArchiveKey(ownerId: string, dealId: string, modifiedAt: string): string {
  const version = encodeURIComponent(modifiedAt.replace(/[:.]/g, '-'));
  return `owners/${ownerId}/deals/${dealId}/${version}.json.gz`;
}

export function companyAttachmentArchiveKey(ownerId: string, companyId: string): string {
  return `owners/${ownerId}/companies/${companyId}/generic-attachments.json.gz`;
}

export async function sha256Hex(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === 'string' ? encoder.encode(value) : value;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('');
}

function hex(value: Uint8Array): string {
  return [...value].map((part) => part.toString(16).padStart(2, '0')).join('');
}

export async function verifyArchivePayload(payload: string, expectedChecksum: string): Promise<void> {
  if (await sha256Hex(payload) !== expectedChecksum) {
    throw new Error('R2 archive checksum verification failed.');
  }
}

function encodeKey(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/');
}

async function hmac(key: Uint8Array, value: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(value)));
}

async function signingKey(secret: string, day: string): Promise<Uint8Array> {
  const kDate = await hmac(encoder.encode(`AWS4${secret}`), day);
  const kRegion = await hmac(kDate, 'auto');
  const kService = await hmac(kRegion, 's3');
  return hmac(kService, 'aws4_request');
}

async function gzip(value: string): Promise<Uint8Array> {
  const stream = new Blob([value]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(value: Uint8Array): Promise<string> {
  const stream = new Blob([value]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

async function signedRequest(method: 'GET' | 'PUT', key: string, body?: Uint8Array): Promise<Response> {
  const config = requiredConfig();
  const now = new Date();
  const day = now.toISOString().slice(0, 10).replaceAll('-', '');
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const host = `${config.accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${encodeURIComponent(config.bucket)}/${encodeKey(key)}`;
  const payloadHash = await sha256Hex(body ?? new Uint8Array());
  const isUpload = method === 'PUT';
  const canonicalHeaders = `${isUpload ? 'content-encoding:gzip\n' : ''}content-type:application/json\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = `${isUpload ? 'content-encoding;' : ''}content-type;host;x-amz-content-sha256;x-amz-date`;
  const canonicalRequest = `${method}\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const scope = `${day}/auto/s3/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${await sha256Hex(canonicalRequest)}`;
  const signature = hex(await hmac(await signingKey(config.secretAccessKey, day), stringToSign));
  const authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return fetch(`https://${host}${canonicalUri}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(isUpload ? { 'content-encoding': 'gzip' } : {}),
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      authorization,
    },
    body: body,
  });
}

function archiveError(action: string, response: Response): Error {
  return new Error(`R2 archive ${action} failed (HTTP ${response.status}).`);
}

export async function putVerifiedArchive(key: string, payload: unknown): Promise<{ key: string; checksum: string }> {
  const json = JSON.stringify(payload);
  const checksum = await sha256Hex(json);
  const upload = await signedRequest('PUT', key, await gzip(json));
  if (!upload.ok) throw archiveError('upload', upload);
  const downloaded = await getArchiveJson<unknown>(key);
  await verifyArchivePayload(JSON.stringify(downloaded), checksum);
  return { key, checksum };
}

export async function getArchiveJson<T>(key: string): Promise<T> {
  const response = await signedRequest('GET', key);
  if (!response.ok) throw archiveError('read', response);
  return JSON.parse(await gunzip(new Uint8Array(await response.arrayBuffer()))) as T;
}
