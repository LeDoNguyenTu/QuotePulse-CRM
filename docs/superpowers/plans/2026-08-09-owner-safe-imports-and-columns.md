# Owner-safe imports and configurable columns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent cross-account cached UI data and expose all imported HubSpot fields through saved per-user column preferences.

**Architecture:** Scope browser query state by account and clear it on authentication transitions. Add normalized JSON snapshots and a per-owner HubSpot property catalogue; the existing importer discovers properties, stores chunked responses, and leaves its current owner-scoped duplicate protection intact. The UI reads the catalogue to offer extra fields while retaining the current default layout.

**Tech Stack:** Vite, React 18, TypeScript, TanStack Query 5, Supabase Postgres/RLS, Deno Edge Functions, HubSpot CRM v3.

## Global Constraints

- Do not change, expose, or copy user-owned secrets.
- All private database reads/writes remain owner-scoped.
- `Run HubSpot import` remains a one-click resumable workflow.
- Existing dashboard defaults remain visible; non-default HubSpot properties start hidden.
- Preserve user-owned `AGENTS.md` and `CLAUDE.md` modifications.

---

### Task 1: Account-scoped query cache

**Files:**
- Modify: `src/hooks/useAuth.tsx`, `src/hooks/useCompanies.ts`, `src/hooks/useCompany.ts`, `src/hooks/useTemplates.ts`, `src/hooks/useIndustries.ts`
- Create: `src/lib/accountQueryScope.ts`, `src/lib/accountQueryScope.test.ts`

- [ ] Write tests proving query keys differ by owner and that an owner transition produces a fresh cache namespace.
- [ ] Run the focused test and observe the missing-helper failure.
- [ ] Add an owner-prefixed query-key helper, include it in private query hooks, and cancel/remove private queries when the authenticated user changes or signs out.
- [ ] Re-run focused tests and the complete Vitest suite.

### Task 2: Persistent property snapshots and preferences

**Files:**
- Create: migration created by `supabase migration new owner_safe_import_properties`
- Modify: `src/lib/types.ts`, `src/hooks/useSettings.ts`
- Create: `src/lib/tablePreferences.ts`, `src/lib/tablePreferences.test.ts`

- [ ] Write tests for defaults, validation, toggle persistence payload, and restore-default behavior.
- [ ] Run the focused test and observe it fail because the preference helper does not exist.
- [ ] Add owner-RLS property catalogue and JSON snapshot columns; add private `table_column_preferences` to `user_settings`.
- [ ] Implement typed preference helpers and settings mutation support.
- [ ] Run the focused tests, local database reset, and typecheck.

### Task 3: Complete HubSpot property retention and fast sync

**Files:**
- Modify: `supabase/functions/_shared/hubspot.ts`, `supabase/functions/hubspot-ingest/index.ts`
- Create: `supabase/functions/_shared/hubspotProperties.ts`

- [ ] Write Deno/unit tests for property-chunk construction and deterministic merging of property snapshots.
- [ ] Run the focused test and observe the helper is absent.
- [ ] Discover readable property definitions per object type; upsert their owner-specific catalogue entries.
- [ ] Fetch property values in safe request chunks, merge them into company/deal/contact snapshots, and only force the full snapshot backfill when the schema revision changes.
- [ ] Replace redundant deal-ID reads with returned upsert data and use per-run object caches without weakening owner filters or duplicate checks.
- [ ] Run focused tests, local migration reset, edge-function type checks, and import-flow smoke validation.

### Task 4: Column selector UI

**Files:**
- Modify: `src/components/CompaniesTable.tsx`, `src/pages/CompanyDetail.tsx`, relevant CSS/UI helpers
- Create: `src/components/ColumnSelector.tsx`, `src/lib/hubspotPropertyDisplay.ts`, `src/lib/hubspotPropertyDisplay.test.ts`

- [ ] Write tests that current columns remain default-visible, unknown fields are hidden by default, and Restore defaults clears the override.
- [ ] Run the tests and observe the missing display/picker implementation failure.
- [ ] Build the reusable Columns control, render safe JSON values by type, and persist selection through `user_settings`.
- [ ] Add the control to the dashboard, deals, and contacts tables; retain `last_deal_at DESC, updated_at DESC, id` ordering.
- [ ] Run focused tests, full unit tests, typecheck, lint, and browser smoke tests.

### Task 5: Favicon and release validation

**Files:**
- Create: `public/quote-pulse.svg`
- Modify: `index.html`

- [ ] Add a compact accessible SVG favicon and reference it from the document head.
- [ ] Run `npm run build`, `npm run typecheck`, `npm run lint`, and `npm test -- --run`.
- [ ] Run `git diff --check` and GitNexus changed-symbol analysis; report the user-facing one-click import behavior and the manual HubSpot scope prerequisite.
