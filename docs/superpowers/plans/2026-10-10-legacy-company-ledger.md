# Legacy Company Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Present archived Legacy companies, contacts, and deals as one company-centred, read-only R2 ledger.

**Architecture:** Add a compact Bloom-filter relationship index to existing archive-object metadata. Build it resumably in the owner-scoped Edge Function, then render exact checksum-verified contact and deal matches inside expandable company rows.

**Tech Stack:** React 18, TypeScript, TanStack Query 5, Supabase Postgres/Edge Functions, Cloudflare R2, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-10-legacy-company-ledger.md`

## Global Constraints

- Legacy workspace only; Sales CRM remains unchanged.
- Customer rows remain in R2 and read-only until selective restore is confirmed.
- Every Edge query is scoped by archive, workspace, and authenticated owner.
- Existing R2 checksums, pointer checks, payload identity, projections, and signed cursors remain in force.
- Index construction is bounded and resumable to stay within Edge Function CPU, memory, and request limits.

## Review Focus

- A malformed Bloom value must cause an extra object read, never omit linked records.
- Concurrent preparation calls must be idempotent and never mark an unverified object indexed.
- A company with no contacts or deals must finish with two clear empty states.
- Child restore cursors must be signed for the child table, not the parent company table.
- Switching archives or workspaces must not reuse relationship results.

---

### Task 1: Relationship metadata

**Files:**
- Create: `supabase/functions/workspace-archive/archiveRelationships.ts`
- Create: `supabase/functions/workspace-archive/archiveRelationships.test.ts`
- Create: `supabase/migrations/20261009215017_legacy_archive_company_bloom.sql`
- Create: matching migration test

**Interfaces:**
- Produces: `createCompanyBloom(rows)`, `companyBloomMayContain(value, companyId)`.

- [ ] Write failing tests for deterministic membership, safe invalid-data fallback, and migration constraints.
- [ ] Run the focused tests and confirm failure because the helper/schema does not exist.
- [ ] Implement the fixed-size versioned Bloom encoding and nullable metadata column.
- [ ] Run focused tests and typecheck.

### Task 2: Bounded R2 relationship API

**Files:**
- Modify: `supabase/functions/workspace-archive/index.ts`
- Modify: `supabase/functions/workspace-archive/archiveBrowse.ts`
- Modify: Edge tests
- Modify: `src/lib/functions.ts`

**Interfaces:**
- Consumes: Bloom helpers from Task 1.
- Produces: `prepare_relationships` and `company_bundle` responses with exact projected child rows and signed cursors.

- [ ] Write failing tests for bounded indexing, exact company matching, corrupt-index fallback, and child cursor identity.
- [ ] Run tests and confirm the missing behavior fails.
- [ ] Store Bloom metadata for new archive objects and resumably backfill verified existing objects.
- [ ] Add owner-scoped company bundle lookup and browser types.
- [ ] Run Edge and function-client tests.

### Task 3: One expandable Legacy sheet

**Files:**
- Create: `src/components/crm/ArchivedCompanyLedger.tsx`
- Create: `src/components/crm/ArchivedCompanyLedger.test.tsx`
- Create: `src/hooks/useArchivedCompanyBundle.ts`
- Modify: `src/pages/Dashboard.tsx`
- Modify: `src/hooks/useArchivedCrmRecords.ts`
- Modify: `src/styles/index.css`

**Interfaces:**
- Consumes: company bundle endpoint from Task 2.
- Produces: company parent rows with inline contact/deal sections and per-record restore actions.

- [ ] Write failing component tests for the single-sheet layout, disclosure, progress, related rows, empty states, and child restore action.
- [ ] Run focused tests and confirm failure because the ledger does not exist.
- [ ] Implement the query hook, company ledger, Legacy-only dashboard wiring, and restrained responsive styles.
- [ ] Run focused tests, interaction tests, typecheck, lint, and build.

### Task 4: Release and evidence

**Files:**
- Create: `docs/development/2026-10-10-legacy-company-ledger-handoff.md`

**Interfaces:**
- Consumes: verified implementation from Tasks 1-3.
- Produces: durable branch, PR, exact SHA, workflow, deployment, and authenticated smoke evidence.

- [ ] Run the full Vitest suite, typecheck, lint, build, migration checks, and GitNexus change detection.
- [ ] Perform a whole-branch review and address Critical/Important findings with RED-GREEN tests.
- [ ] Commit, push, merge the PR, and wait for exact-SHA Supabase and Vercel success.
- [ ] In production, verify one company expands to its own contacts and deals, unrelated rows never appear, read-only warnings remain, and leave Sales Contacts open.
