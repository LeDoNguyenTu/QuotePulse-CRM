export interface PropertyDefinitionLike {
  property_name: string;
}

/**
 * Catalogues describe every field HubSpot makes available. The table picker
 * should only offer fields that have at least one non-empty imported value.
 */
export function fieldsWithImportedValues<T extends PropertyDefinitionLike>(
  catalog: T[],
  observedPropertyNames: readonly string[]
): T[] {
  const observed = new Set(observedPropertyNames);
  return catalog.filter((field) => observed.has(field.property_name));
}
