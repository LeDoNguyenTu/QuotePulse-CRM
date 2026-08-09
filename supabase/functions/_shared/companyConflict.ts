function postgresErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  return typeof error.code === 'string' ? error.code : null;
}

/**
 * A functional unique index cannot be named through Supabase's column-list
 * `onConflict` option. Let PostgreSQL arbitrate concurrent inserts, then read
 * the row committed by the winning invocation when this insert loses the race.
 */
export async function recoverCompanyInsertConflict<T>(
  error: unknown,
  lookup: () => Promise<T | null>
): Promise<T> {
  if (postgresErrorCode(error) !== '23505') throw error;
  const winner = await lookup();
  if (!winner) throw error;
  return winner;
}

export interface ExistingCompanyForMerge {
  id: string;
  industry: string | null;
  website: string | null;
  hubspot_company_id: string | null;
  deleted_at: string | null;
}

interface IncomingCompanyFields {
  industry: string | null;
  website: string | null;
  hubspot_company_id: string | null;
  hubspot_properties?: Record<string, string | null>;
  hubspot_properties_schema_version?: string | null;
}

export type ExistingCompanyPlan =
  | { action: 'skip-trashed'; id: string }
  | {
      action: 'update';
      id: string;
      fields: Record<string, unknown>;
    };

/** Keep normal lookups and recovered insert races on the exact same path. */
export function planExistingCompany(
  existing: ExistingCompanyForMerge,
  incoming: IncomingCompanyFields
): ExistingCompanyPlan {
  if (existing.deleted_at) return { action: 'skip-trashed', id: existing.id };

  return {
    action: 'update',
    id: existing.id,
    fields: {
      industry: incoming.industry ?? existing.industry,
      website: incoming.website ?? existing.website,
      hubspot_company_id: incoming.hubspot_company_id ?? existing.hubspot_company_id,
      ...(incoming.hubspot_properties
        ? { hubspot_properties: incoming.hubspot_properties }
        : {}),
      ...(incoming.hubspot_properties_schema_version
        ? { hubspot_properties_schema_version: incoming.hubspot_properties_schema_version }
        : {}),
    },
  };
}
