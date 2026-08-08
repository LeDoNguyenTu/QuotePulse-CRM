/**
 * Private query data must never share a cache entry between authenticated users.
 * The database's RLS policies protect requests, while this protects the browser
 * from displaying a prior user's already-resolved response during a session swap.
 */
export function accountQueryKey<T extends readonly unknown[]>(ownerId: string | null | undefined, key: T) {
  return ['account', ownerId ?? 'anonymous', ...key] as const;
}

export function hasAccountChanged(
  previousOwnerId: string | null | undefined,
  nextOwnerId: string | null | undefined
) {
  return previousOwnerId !== nextOwnerId;
}
