interface AssociatedObject {
  associations?: Record<string, { results?: Array<{ id: string }> }>;
}

/** Ordered unique association IDs suitable for HubSpot's batch-read endpoint. */
export function associatedObjectIds(
  objects: AssociatedObject[],
  objectType: string
): string[] {
  const ids = new Set<string>();
  for (const object of objects) {
    for (const association of object.associations?.[objectType]?.results ?? []) {
      if (association.id) ids.add(association.id);
    }
  }
  return [...ids];
}
