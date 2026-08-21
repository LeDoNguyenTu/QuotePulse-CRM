# Storage Status and Navigation State Design

## Goal

Add a secure dashboard view of Supabase database and Cloudflare R2 capacity, and make authenticated drill-down navigation return users to the exact prior list state.

## Storage status

- Show Supabase database bytes against `DATABASE_SIZE_LIMIT_BYTES` (default `500000000`).
- Show R2 payload plus metadata bytes against `R2_STORAGE_LIMIT_BYTES` (default `10000000000`).
- Fetch both through an authenticated `storage-status` Edge Function. No administrative credential is exposed to the browser.
- Read database size through a tightly permissioned service-role RPC.
- Prefer Cloudflare GraphQL R2 analytics when `CLOUDFLARE_API_TOKEN` has Account Analytics Read. Fall back to an S3 ListObjectsV2 inventory using the existing R2 credentials.
- Cache the R2 inventory result in a service-role-only database row for 15 minutes so ordinary dashboard activity and HubSpot imports are unaffected.
- Render separate accessible progress bars with used, remaining, percentage, last-updated time, refresh, warning thresholds, and per-service error states.

## Navigation state

- Store dashboard object tab, search, filters, and zero-based page in URL search parameters.
- Omit default values so `/` remains the default companies view.
- Store each view's state independently: company filters under company-prefixed parameters and HubSpot object search/page under view-specific parameters.
- When a row opens a company, include the current route as the safe return target and record the current scroll position in session storage.
- A reusable authenticated back control uses the recorded internal target and falls back to the correct list route for direct links.
- Restore scroll only after returning to the recorded route; URL state survives refresh and copied URLs.

## Security and compatibility

- `storage-status` requires a valid Supabase user JWT and permits only `GET`/`OPTIONS`.
- The database-size function revokes execute from `PUBLIC`, `anon`, and `authenticated`, granting only `service_role`.
- The cache table is not readable or writable by browser roles.
- Existing import, export, archive, and table-fetching contracts remain unchanged.

## Verification

- Unit tests cover URL round trips/defaults/malformed input, safe return targets, capacity calculations, Cloudflare analytics parsing, R2 inventory parsing/pagination, and cache freshness.
- Run the complete Vitest suite, typecheck, lint, build, Supabase database tests/lint where available, and authenticated browser smoke tests.
- Push only after GitNexus change detection, then verify GitHub Actions, Supabase deployment, Vercel deployment, and production storage/back behavior.
