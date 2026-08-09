export interface PropertyDefinitionLike {
  property_name: string;
}

/** Keep the complete HubSpot catalogue, with empty-for-now fields grouped separately. */
export function splitPropertiesByCoverage<T extends PropertyDefinitionLike>(
  catalog: T[],
  observedPropertyNames: readonly string[]
): { available: T[]; hidden: T[] } {
  const observed = new Set(observedPropertyNames);
  return catalog.reduce<{ available: T[]; hidden: T[] }>(
    (groups, field) => {
      groups[observed.has(field.property_name) ? 'available' : 'hidden'].push(field);
      return groups;
    },
    { available: [], hidden: [] }
  );
}
