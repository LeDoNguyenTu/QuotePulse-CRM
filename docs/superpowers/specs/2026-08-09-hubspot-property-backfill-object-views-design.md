# HubSpot Property Backfill and Object Views Design

## Goal

Make the existing **Sync HubSpot** button repair historic deal-property snapshots while continuing to import new and changed records, and make every discovered HubSpot property selectable in separate Companies, Deals, and Contacts dashboard views.

## Confirmed data problem

The property catalogue is present, but most historic rows predate full-property hydration. The normal incremental path searches only records modified after its watermark, so an unchanged historic deal with a missing property snapshot is invisible. Company rows created from deal names also do not represent a HubSpot Company object unless a real HubSpot company association exists; deal fields must therefore remain deal fields rather than being flattened onto an arbitrary company.

## Import architecture

The existing new-and-changed sync remains first so normal daily use stays responsive. After that pass, the same invocation advances a dedicated, resumable deal-property sweep. The sweep pages HubSpot deals using a cursor stored in `sync_state`, selects only locally held deals whose property schema version is missing or stale, batch-reads the full readable property catalogue, and updates only that owner's matching deal snapshot. It does not recreate rows, fuzzy-match companies, revisit notes/files, or alter customer-entered data.

The property sweep stream includes the current schema hash. A new HubSpot property therefore creates a new resumable sweep automatically. A completed stream is still checked against the database for a missing/stale row so a prematurely completed cursor cannot hide a gap.

## Coverage tracking

`hubspot_property_catalog` gains a monotonic `has_value` flag. Full-property batch reads mark catalogue entries that contain at least one meaningful value. The coverage RPC reads this small owner-scoped catalogue instead of expanding JSON across hundreds of thousands of rows, avoiding the statement timeout seen with the previous implementation. A field stays visible in the Columns menu even when `has_value` is false; it is grouped under “Hidden — no imported values yet” and labelled `(null)`.

## Dashboard architecture

The dashboard gains Companies, Deals, and Contacts tabs.

- Companies retains the current workflow, filters, bulk actions, export, and company-detail navigation.
- Deals is sorted by HubSpot last-modified time, with HubSpot created time as the fallback, and exposes normalized deal columns plus every deal property in the catalogue.
- Contacts exposes normalized contact columns plus every contact property already captured from associated HubSpot contacts.
- Each tab uses its own server-side pagination, search text, and saved column preference in `user_settings.table_column_preferences`.
- Existing normalized columns remain the restore-default set. Non-default HubSpot properties are hidden until selected. Selections survive refresh and future login.

No deal property is copied onto the Company table merely for display: one company can have many deals, and choosing one would silently discard or misrepresent the others.

## Progress and errors

Import responses include a `properties_backfilled` count and a `properties` progress phase. The progress panel says when historical properties are being repaired, and completion reaches 100% only after both the normal sync and the property sweep finish. Each slice remains idempotent and resumable. HubSpot/API/database errors remain visible and do not produce a false success.

## Security and data safety

All service-role reads and writes keep explicit `owner_id` filters. The backfill updates only deals already matched by `(owner_id, hubspot_deal_id)`. The browser continues to rely on RLS, and the coverage function remains `security invoker` and owner-scoped. Testing uses local fixtures and the local Supabase stack only; no production customer rows are mutated.

## Verification

Verification covers pure property-selection/backfill helpers, import accumulation and progress behavior, saved per-object columns, object-table value rendering, a full local migration reset and database lint, the complete Vitest suite, TypeScript, ESLint, production build, and a local browser pass for the three dashboard tabs.
