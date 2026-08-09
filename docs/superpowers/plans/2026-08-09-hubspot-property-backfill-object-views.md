# HubSpot Property Backfill and Object Views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair missing historic HubSpot deal-property snapshots from the existing one-click sync and expose complete Companies, Deals, and Contacts property views with saved columns.

**Architecture:** Keep the fast incremental sync first, then advance a schema-versioned resumable property-only deal sweep. Track non-empty property coverage in the small owner-scoped catalogue and render each HubSpot object type in its own paginated dashboard table.

**Tech Stack:** React 18, TypeScript, TanStack Query, Supabase Postgres/RLS, Supabase Edge Functions (Deno), HubSpot CRM v3, Vitest.

## Global Constraints

- Never mutate production customer data during verification.
- Every service-role database read and write must explicitly filter or set `owner_id`.
- Do not fuzzy-match HubSpot objects or flatten an arbitrary deal onto a company.
- The existing Sync HubSpot button must run the normal sync and historical repair without a second action.
- Do not commit or push; provide the final commit message to the user.

---

### Task 1: Property backfill and coverage helpers

**Files:**
- Modify: `supabase/functions/_shared/hubspotProperties.ts`
- Modify: `supabase/functions/_shared/hubspotProperties.test.ts`

**Interfaces:**
- Produces: `propertyNamesWithValues(objects)`, `propertyBackfillStream(objectType, schemaVersion)`, and `filterPropertyBackfillCandidates(objects, heldVersions, schemaVersion)`.

- [ ] Write tests proving blank/null values are excluded, useful values are retained, stream names change with schema versions, and only missing/stale held snapshots are selected.
- [ ] Run `npm test -- supabase/functions/_shared/hubspotProperties.test.ts --run` and verify the new assertions fail for missing exports.
- [ ] Implement the three pure helpers.
- [ ] Re-run the focused test and keep it green.

### Task 2: Fast owner-scoped coverage storage

**Files:**
- Create: `supabase/migrations/<generated-version>_hubspot_property_coverage_state.sql`
- Modify: `src/lib/types.ts`

**Interfaces:**
- Produces: `hubspot_property_catalog.has_value boolean` and an owner-scoped `hubspot_property_names_with_values(text)` implementation backed by the catalogue.

- [ ] Use `npx supabase migration new hubspot_property_coverage_state` to create the migration filename.
- [ ] Add `has_value`, replace the coverage RPC without expanding row JSON, retain `security invoker`, and add a schema-version lookup index for property-backfill checks.
- [ ] Update the TypeScript catalogue type.
- [ ] Reset the local database, seed isolated test owner/catalog rows, and verify the RPC returns only that owner's `has_value=true` fields.

### Task 3: Resumable property-only sweep

**Files:**
- Modify: `supabase/functions/hubspot-ingest/index.ts`
- Modify: `src/lib/functions.ts`
- Modify: `src/lib/importSession.ts`
- Modify: `src/lib/importSession.test.ts`

**Interfaces:**
- Consumes: Task 1 helper functions and Task 2 `has_value` column.
- Produces: `properties_backfilled` import count and progress phase `properties`.

- [ ] Extend import-session tests with literal cumulative property-backfill counts and progress preservation; run focused tests to observe the expected failure.
- [ ] Add catalogue coverage marking after full batch hydration.
- [ ] Add the schema-versioned property sweep that pages active deals, selects only held stale snapshots, updates by owner and HubSpot deal ID, persists its cursor, and resumes safely.
- [ ] Run the normal new/changed sync first, then the property sweep; report `done=false` until both complete.
- [ ] Update frontend response types and import accumulation, then re-run focused tests.

### Task 4: Deal/contact page model and table behavior

**Files:**
- Create: `src/lib/hubspotObjectTable.ts`
- Create: `src/lib/hubspotObjectTable.test.ts`
- Create: `src/hooks/useHubspotObjects.ts`
- Create: `src/components/HubspotObjectTable.tsx`

**Interfaces:**
- Produces: base column definitions, normalized/property cell resolution, and `useHubspotObjects(objectType, filters)` with owner-scoped RLS queries and server pagination.

- [ ] Write failing tests proving normalized columns and arbitrary HubSpot properties resolve independently and missing values render as null.
- [ ] Implement the pure table model and pass focused tests.
- [ ] Implement paginated Deals/Contacts queries with search and last-modified-first deal ordering.
- [ ] Implement the reusable accessible table component using only the selected columns.

### Task 5: Three dashboard views and saved columns

**Files:**
- Modify: `src/pages/Dashboard.tsx`
- Modify: `src/components/CompaniesTable.tsx`
- Modify: `src/lib/tablePreferences.test.ts`

**Interfaces:**
- Consumes: existing `table_column_preferences`, Tasks 2 and 4 catalog/coverage/table APIs.
- Produces: Companies, Deals, Contacts tabs with independent saved column selections.

- [ ] Extend preference tests to prove all three tables retain independent selections and restore their defaults; run them red.
- [ ] Add dashboard tabs and object-specific catalog, coverage, search, pagination, and column picker state.
- [ ] Make CompaniesTable honor its selected normalized columns as well as dynamic property columns.
- [ ] Add property-backfill phase/count copy to the live panel and report.
- [ ] Re-run focused preference/import/table tests.

### Task 6: Full verification and handoff

**Files:**
- Review all changed files.

**Interfaces:**
- Produces: verified working tree and user-owned commit message.

- [ ] Run `npx supabase db reset` and `npx supabase db lint` against the local stack.
- [ ] Run `npm test -- --run`, `npm run typecheck`, `npm run lint`, and `npm run build`.
- [ ] Run a local browser smoke test for Companies, Deals, Contacts, the Columns menu, and saved selection behavior using only local/test data.
- [ ] Run GitNexus change detection and inspect the final diff for owner scoping, unintended files, secrets, and production-data writes.
- [ ] Provide the user a concise summary and one commit message without committing or pushing.
