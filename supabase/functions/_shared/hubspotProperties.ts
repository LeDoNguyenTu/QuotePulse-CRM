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
