# Job Intelligence and Security Headers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe, per-company MNC job discovery through Greenhouse and Lever, display its results in KYC, and harden Vercel response headers.

**Architecture:** Owner-scoped job-source and job-opportunity tables store user-configured public ATS connectors and their normalised vacancies. A JWT-protected Supabase Edge Function reads only the caller's sources, fetches public Greenhouse or Lever listings, then upserts owner-scoped records. The KYC panel configures and runs connectors for the current company. LinkedIn and MyCareersFuture remain explicitly manual/authorisation-required and are never scraped.

**Tech Stack:** React 18, TanStack Query, TypeScript, Supabase Postgres/RLS, Deno Edge Functions, Vercel.

## Global Constraints

- All new public-schema tables enable RLS, use owner predicates, and explicitly grant only authenticated access required by the browser.
- Service-role Edge Function reads and writes always filter or set `owner_id` explicitly.
- Only documented Greenhouse and Lever public job-board APIs are automated; do not scrape LinkedIn or MyCareersFuture.
- Do not commit or push; the user commits and pushes.

---

### Task 1: Secure Vercel response configuration

**Files:**
- Modify: `vercel.json`
- Test: `src/lib/vercelConfig.test.ts`

- [x] Add a failing test that parses `vercel.json` and requires CSP, frame protection, MIME protection, referrer policy, permissions policy, and HSTS headers.
- [x] Run `npm test -- --run src/lib/vercelConfig.test.ts` and confirm it fails before a header configuration exists.
- [x] Add a wildcard Vercel header rule that preserves SPA rewrites and restricts scripts, frames, objects, browser permissions, and referrer leakage.
- [x] Re-run the focused test and confirm it passes.

### Task 2: Persist private job sources and opportunities

**Files:**
- Create: `supabase/migrations/<timestamp>_job_intelligence.sql`
- Modify: `src/lib/types.ts`
- Test: `src/lib/jobIntelligence.test.ts`

- [x] Add a failing unit test for job-source validation and fingerprinting.
- [x] Run the focused test and confirm it fails because the helper is absent.
- [x] Create owner-scoped `job_source_configs` and `job_opportunities` tables, indexes, update triggers, RLS policies, and authenticated grants.
- [x] Add frontend types and a pure helper that validates Greenhouse board tokens / Lever site slugs and produces stable job fingerprints.
- [x] Re-run the focused test and confirm it passes.

### Task 3: Discover permitted MNC career jobs

**Files:**
- Create: `supabase/functions/discover-jobs/index.ts`
- Modify: `supabase/config.toml`
- Modify: `src/lib/functions.ts`
- Test: `supabase/functions/_shared/jobSources.test.ts`

- [x] Add failing tests for normalising Greenhouse and Lever records and rejecting unsupported sources.
- [x] Run the focused test and confirm it fails before the adapter exists.
- [x] Implement the JWT-protected function with caller validation, explicit owner filters, bounded public-API fetches, and idempotent upserts.
- [x] Add the typed browser invocation wrapper and function verification configuration.
- [x] Re-run the focused adapter tests and confirm they pass.

### Task 4: Configure and display Job Intelligence in KYC

**Files:**
- Modify: `src/hooks/useCompany.ts`
- Modify: `src/components/KycPanel.tsx`
- Test: `src/lib/jobIntelligence.test.ts`

- [x] Add a failing test for the display state: supported sources are configurable and unsupported portals show a manual/authorisation notice.
- [x] Run the focused test and confirm it fails before the display helper exists.
- [x] Add owner-scoped query and mutations for sources/opportunities, then add the KYC Job Intelligence panel with source setup, refresh, results, official Apply links, source metadata, and LinkedIn/MyCareersFuture status notice.
- [x] Re-run focused tests and confirm they pass.

### Task 5: Verify the integrated change

**Files:**
- Verify: all changed files

- [x] Run `npx supabase db reset --local --yes` to apply every migration in a clean local database.
- [x] Run `npm test -- --run`, `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`.
- [x] Run GitNexus changed-scope analysis, inspect the final diff, and report the no-scraping limitation and any deployment-only verification remaining.
