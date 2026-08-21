# Storage Status and Navigation State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secure Supabase/R2 capacity monitoring and exact dashboard state restoration across drill-down navigation.

**Architecture:** Pure TypeScript helpers own URL serialization, safe return targets, usage calculations, and R2 metrics parsing so their contracts can be developed test-first. An authenticated Supabase Edge Function combines a restricted database-size RPC with Cloudflare analytics or a cached S3 inventory fallback; the React dashboard consumes that endpoint without receiving credentials.

**Tech Stack:** React 18, React Router 6, TanStack Query 5, TypeScript, Vitest, Supabase Postgres/Edge Functions, Cloudflare R2 S3 and GraphQL APIs.

**Spec:** `docs/superpowers/specs/2026-08-21-storage-status-navigation-state-design.md`

## Global Constraints

- Keep all Cloudflare, R2, Supabase service-role, and database credentials server-only.
- Preserve current import and table-fetch performance; cache inventory fallback for 15 minutes.
- Default limits are exactly 500000000 bytes for Supabase and 10000000000 bytes for R2, both overridable by Edge Function secrets.
- URL state must survive refresh and sharing; scroll restoration is session-scoped.
- Do not change authentication-page destinations.

---

### Task 1: Dashboard URL and return navigation contracts

**Files:**
- Create: `src/lib/dashboardState.ts`
- Create: `src/lib/dashboardState.test.ts`
- Create: `src/lib/returnNavigation.ts`
- Create: `src/lib/returnNavigation.test.ts`

**Interfaces:**
- Produces: `readDashboardState(search)`, `writeDashboardState(state)`, `detailNavigationState(location, scrollY)`, `safeReturnTarget(state, fallback)`, and session scroll helpers.

- [ ] Write tests with literal URLs proving default omission, all company filters, independent company/deal/contact searches and pages, malformed page normalization, internal return-target validation, and one-shot scroll restoration.
- [ ] Run `npm test -- --run src/lib/dashboardState.test.ts src/lib/returnNavigation.test.ts` and confirm failures are caused by missing modules.
- [ ] Implement only the pure parsers/serializers and navigation helpers needed by those tests.
- [ ] Re-run the focused tests and confirm they pass.

### Task 2: Wire persistent dashboard state and reusable back control

**Files:**
- Create: `src/components/HistoryBackLink.tsx`
- Modify: `src/pages/Dashboard.tsx`
- Modify: `src/components/CompaniesTable.tsx`
- Modify: `src/components/HubspotObjectsPanel.tsx`
- Modify: `src/components/HubspotObjectTable.tsx`
- Modify: `src/pages/CompanyDetail.tsx`
- Modify: `src/pages/UploadedFileDetail.tsx`
- Modify: `src/pages/Trash.tsx`

**Interfaces:**
- Consumes: Task 1 URL and return-navigation helpers.
- Produces: URL-controlled dashboard views and history-aware authenticated back controls.

- [ ] Replace Dashboard's local tab/company-filter state with `useSearchParams` state derived through `readDashboardState`; updates write through `writeDashboardState`.
- [ ] Make `HubspotObjectsPanel` controlled for search/page so deal and contact state remains in the URL.
- [ ] Pass the current route and scroll position when company rows are opened.
- [ ] Use `HistoryBackLink` in authenticated detail/back locations with route-specific fallbacks.
- [ ] Run the Task 1 tests plus `npm run typecheck` and fix only contract/wiring errors.

### Task 3: Storage usage domain and R2 readers

**Files:**
- Create: `src/lib/storageStatus.ts`
- Create: `src/lib/storageStatus.test.ts`
- Create: `supabase/functions/_shared/r2Usage.ts`
- Create: `supabase/functions/_shared/r2Usage.test.ts`

**Interfaces:**
- Produces: `capacityStatus(usedBytes, limitBytes)`, byte formatting data, `parseR2Analytics`, `parseR2ListPage`, and `readR2Usage` with analytics-to-inventory fallback.

- [ ] Write frontend tests proving clamped percentage, remaining bytes, and green/amber/red thresholds at literal boundaries.
- [ ] Write Edge tests proving Cloudflare response parsing, XML inventory parsing, continuation-token handling, and exact payload-plus-metadata totals.
- [ ] Run focused Vitest tests and confirm missing-module failures.
- [ ] Implement the capacity helpers and R2 readers with dependency-injected fetch for deterministic tests.
- [ ] Re-run focused tests and confirm they pass.

### Task 4: Authenticated storage endpoint and database objects

**Files:**
- Create: `supabase/migrations/<generated>_storage_status.sql`
- Create: `supabase/functions/storage-status/index.ts`
- Create: `supabase/functions/storage-status/index.test.ts`
- Modify: `supabase/config.toml`
- Modify: `.github/workflows/supabase.yml`

**Interfaces:**
- Consumes: `readR2Usage` from Task 3 and existing `getAdminClient`/`getUserId`.
- Produces: authenticated GET JSON `{ measuredAt, database, r2 }` with independent service errors.

- [ ] Create the migration with `supabase migration new storage_status`; add a service-role-only database-size function and cache table with browser-role privileges revoked.
- [ ] Write handler tests proving method rejection, missing/invalid JWT rejection, cached response use, and partial-service error payloads.
- [ ] Run the handler test and confirm it fails before the handler exists.
- [ ] Implement the handler, limit validation, cache freshness check, R2 refresh, and response headers.
- [ ] Add `verify_jwt = true`, workflow secret checks, and function deployment entry.
- [ ] Run focused Edge tests and local SQL/database checks.

### Task 5: Storage dashboard component

**Files:**
- Create: `src/hooks/useStorageStatus.ts`
- Create: `src/components/StorageStatusPanel.tsx`
- Modify: `src/pages/Dashboard.tsx`
- Modify: `src/lib/functions.ts`

**Interfaces:**
- Consumes: Task 3 capacity helper and Task 4 endpoint response.
- Produces: cached/refetchable query and two accessible progress bars.

- [ ] Add the typed `storageStatus` function invocation and a five-minute TanStack query.
- [ ] Render Supabase and R2 cards with percentage, used/limit, remaining capacity, source/update time, refresh, and isolated error states.
- [ ] Mount the panel below the Dashboard heading without changing import controls or table query timing.
- [ ] Run focused tests, typecheck, lint, and build.

### Task 6: Full verification, release, and production checks

**Files:**
- Modify only files required by verified failures.

**Interfaces:**
- Consumes: all preceding tasks.
- Produces: tested commit on `main` and verified deployments.

- [ ] Run `npm test -- --run`, `npm run typecheck`, `npm run lint`, and `npm run build` with fresh successful output.
- [ ] Run Supabase function tests, database reset/tests/lint/advisors where the installed CLI/environment supports them.
- [ ] Exercise dashboard URL persistence, Companies/Deals/Contacts drill-down Back behavior, refresh preservation, scroll restoration, and storage refresh in a browser.
- [ ] Run `gitnexus_detect_changes({scope: "all"})`, inspect the diff, and confirm only expected flows are affected.
- [ ] Set/verify required remote Edge secrets without printing values.
- [ ] Commit all intended changes, push to `main`, and verify GitHub Actions, Supabase migration/function availability, Vercel READY state, and production browser behavior.
