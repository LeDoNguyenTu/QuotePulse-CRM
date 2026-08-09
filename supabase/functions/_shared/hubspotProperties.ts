export interface HubspotPropertyDefinition {
  name: string;
  label: string;
  type?: string;
  fieldType?: string;
  groupName?: string;
  displayOrder?: number;
  hubspotDefined?: boolean;
  archived?: boolean;
}

interface HubspotObjectWithProperties {
  id: string;
  properties: Record<string, string | null | undefined>;
}

/** Keep URL query strings comfortably below HubSpot's request-size limit. */
export function chunkPropertyNames(names: string[], maxLength = 2_500): string[][] {
  const chunks: string[][] = [];
  let chunk: string[] = [];
  let length = 0;
  for (const name of [...new Set(names)].filter(Boolean)) {
    const nextLength = length + (chunk.length ? 1 : 0) + name.length;
    if (chunk.length && nextLength > maxLength) {
      chunks.push(chunk);
      chunk = [];
      length = 0;
    }
    chunk.push(name);
    length += (chunk.length > 1 ? 1 : 0) + name.length;
  }
  if (chunk.length) chunks.push(chunk);
  return chunks;
}

export function mergeHubspotProperties(
  ...snapshots: Array<Record<string, string | null | undefined>>
): Record<string, string | null> {
  return Object.assign({}, ...snapshots) as Record<string, string | null>;
}

/** A stable lightweight version that changes whenever the readable schema changes. */
export function propertySchemaVersion(definitions: HubspotPropertyDefinition[]): string {
  let hash = 2_166_136_261;
  for (const name of definitions.filter((d) => !d.archived).map((d) => d.name).sort()) {
    for (let i = 0; i < name.length; i++) {
      hash ^= name.charCodeAt(i);
      hash = Math.imul(hash, 16_777_619);
    }
  }
  return `v${(hash >>> 0).toString(16)}`;
}

/** Property names for which at least one object carries a useful value. */
export function propertyNamesWithValues(objects: HubspotObjectWithProperties[]): string[] {
  const names = new Set<string>();
  for (const object of objects) {
    for (const [name, value] of Object.entries(object.properties)) {
      if (value == null) continue;
      const normalized = String(value).trim();
      if (normalized && normalized.toLowerCase() !== 'null') names.add(name);
    }
  }
  return [...names].sort();
}

/** A changed property catalogue automatically starts an independent backfill. */
export function propertyBackfillStream(objectType: string, schemaVersion: string): string {
  return `${objectType}:properties:${schemaVersion}`;
}

/** One-time owner-scoped scan for values already present before coverage tracking existed. */
export function propertyCoverageStream(objectType: string): string {
  return `${objectType}:coverage:v1`;
}

export function propertyCataloguesComplete(
  loaded: Record<'deals' | 'companies' | 'contacts', boolean>
): boolean {
  return loaded.deals && loaded.companies && loaded.contacts;
}

export function syncCompletedRecently(
  lastSyncedAt: string | null,
  now = Date.now(),
  windowMs = 120_000
): boolean {
  if (!lastSyncedAt) return false;
  const completedAt = Date.parse(lastSyncedAt);
  return Number.isFinite(completedAt) && completedAt <= now && now - completedAt < windowMs;
}

/** Repair only objects already present locally; the normal sync owns new objects. */
export function filterPropertyBackfillCandidates<T extends HubspotObjectWithProperties>(
  objects: T[],
  heldVersions: ReadonlyMap<string, string | null>,
  schemaVersion: string,
  includeCurrent = false
): T[] {
  return objects.filter((object) =>
    heldVersions.has(object.id) && (includeCurrent || heldVersions.get(object.id) !== schemaVersion)
  );
}
