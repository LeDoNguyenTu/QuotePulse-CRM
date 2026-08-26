import {
  dealArchiveKey,
  dealBatchArchiveKey,
  putVerifiedArchive,
  sha256Hex,
} from './r2Archive.ts';

export type HubspotDealProperties = Record<string, string | null>;

export interface DealSnapshotInput {
  ownerId: string;
  hubspotDealId: string;
  modifiedAt: string | null;
  schemaVersion: string;
  properties: HubspotDealProperties;
}

export interface LeanDealSnapshot {
  hubspot_properties: Record<string, never>;
  hubspot_properties_schema_version: string;
  r2_archive_key: string;
  r2_archive_sha256: string;
  r2_archived_at: string;
}

export interface DealPropertyArchiveRow {
  id: string;
  hubspotDealId: string;
  expectedModifiedAt: string | null;
  properties: HubspotDealProperties;
}

export interface DealPropertyArchiveBatchInput {
  ownerId: string;
  schemaVersion: string;
  rows: DealPropertyArchiveRow[];
}

export interface DealPropertyArchiveFinalization {
  ownerId: string;
  schemaVersion: string;
  r2Key: string;
  r2Sha256: string;
  rows: Array<{
    id: string;
    hubspot_deal_id: string;
    expected_modified_at: string | null;
  }>;
}

interface DealSnapshotDependencies {
  putVerifiedArchive: typeof putVerifiedArchive;
  now: () => Date;
}

const defaultDependencies: DealSnapshotDependencies = {
  putVerifiedArchive,
  now: () => new Date(),
};

interface DealPropertyBatchDependencies {
  putVerifiedArchive: typeof putVerifiedArchive;
  batchId: () => string;
}

const defaultBatchDependencies: DealPropertyBatchDependencies = {
  putVerifiedArchive,
  batchId: () => crypto.randomUUID(),
};

export async function persistDealSnapshot<T>(
  input: DealSnapshotInput,
  persist: (snapshot: LeanDealSnapshot) => Promise<T> | T,
  dependencies: DealSnapshotDependencies = defaultDependencies,
): Promise<T> {
  const payload = {
    hubspot_deal_id: input.hubspotDealId,
    properties: input.properties,
  };
  const contentHash = await sha256Hex(JSON.stringify(payload));
  const key = dealArchiveKey(
    input.ownerId,
    input.hubspotDealId,
    `${input.modifiedAt ?? 'unknown'}-${contentHash}`,
  );
  const archived = await dependencies.putVerifiedArchive(key, payload);

  return persist({
    hubspot_properties: {},
    hubspot_properties_schema_version: input.schemaVersion,
    r2_archive_key: archived.key,
    r2_archive_sha256: archived.checksum,
    r2_archived_at: dependencies.now().toISOString(),
  });
}

export async function archiveDealPropertyBatch(
  input: DealPropertyArchiveBatchInput,
  finalize: (batch: DealPropertyArchiveFinalization) => Promise<number>,
  dependencies: DealPropertyBatchDependencies = defaultBatchDependencies,
): Promise<number> {
  const key = dealBatchArchiveKey(
    input.ownerId,
    `${input.schemaVersion}-${dependencies.batchId()}`,
  );
  const archived = await dependencies.putVerifiedArchive(key, {
    deals: input.rows.map((row) => ({
      id: row.id,
      hubspot_deal_id: row.hubspotDealId,
      properties: row.properties,
    })),
  });
  const finalized = await finalize({
    ownerId: input.ownerId,
    schemaVersion: input.schemaVersion,
    r2Key: archived.key,
    r2Sha256: archived.checksum,
    rows: input.rows.map((row) => ({
      id: row.id,
      hubspot_deal_id: row.hubspotDealId,
      expected_modified_at: row.expectedModifiedAt,
    })),
  });
  if (finalized !== input.rows.length) {
    throw new Error(
      `Only ${finalized} of ${input.rows.length} deal property snapshots finalized; retrying the page.`,
    );
  }
  return finalized;
}
