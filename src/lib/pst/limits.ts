import { MAX_PST_MESSAGES, MAX_PST_METADATA_BYTES, type PstMessageMetadata } from './types';

export const METADATA_LIMIT_ERROR = 'PST metadata exceeds the local safety limit (25,000 messages or 64 MiB). Export a smaller PST or date range.';

export function measureNextMetadata(messageCount: number, metadataBytes: number, metadata: PstMessageMetadata) {
  const nextBytes = metadataBytes + new TextEncoder().encode(JSON.stringify(metadata)).byteLength;
  if (messageCount + 1 > MAX_PST_MESSAGES || nextBytes > MAX_PST_METADATA_BYTES) throw new Error(METADATA_LIMIT_ERROR);
  return nextBytes;
}
