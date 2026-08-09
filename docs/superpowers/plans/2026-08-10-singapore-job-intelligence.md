# Singapore-first MNC Job Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add KYC-assisted, Singapore-first job discovery across public ATS feeds, employer career pages, and compliant link-only job portals.

**Architecture:** Pure shared modules detect source URLs, normalise official provider payloads and public search links, and group crossposts. The existing KYC and discover-jobs Edge Functions orchestrate these helpers while retaining explicit owner filters; React confirms discovered candidates and renders grouped jobs.

**Tech Stack:** React 18, TypeScript, Vitest, Supabase Postgres/RLS, Supabase Deno Edge Functions, Serper search.

## Global Constraints

- Default market is `Singapore`; do not discard global direct-source roles.
- Never scrape LinkedIn, MyCareersFuture, JobStreet, Indeed, Foundit, FastJobs, Glints, Careers@Gov, or Workday pages.
- Never automate job applications.
- Require explicit user confirmation before persisting a KYC-discovered source.
- Every service-role query remains explicitly owner-scoped.
- Preserve the existing uncommitted Greenhouse and Lever help-copy correction.

---

### Task 1: Source contracts and detection

**Files:**
- Create: `supabase/functions/_shared/jobSourceDiscovery.ts`
- Create: `supabase/functions/_shared/jobSourceDiscovery.test.ts`
- Modify: `src/lib/jobIntelligence.ts`
- Modify: `src/lib/jobIntelligence.test.ts`
- Modify: `src/lib/types.ts`

**Interfaces:**
- Produces `JobSourceCandidate`, direct/search provider lists, `detectJobSourceCandidates(urls)`, provider metadata, identifier validation, and canonical grouping helpers.

- [ ] Write tests proving exact-host ATS detection, Singapore portal classification, unsafe URL rejection, deduplication, and crosspost grouping.
- [ ] Run focused tests and confirm they fail because the new contracts do not exist.
- [ ] Implement the minimal pure helpers and types.
- [ ] Run focused tests and confirm they pass.

### Task 2: Provider adapters

**Files:**
- Modify: `supabase/functions/_shared/jobSources.ts`
- Modify: `supabase/functions/_shared/jobSources.test.ts`

**Interfaces:**
- Produces normalisers for Greenhouse, Lever, SmartRecruiters, Ashby, employer-domain search results, and portal search links.

- [ ] Add literal payload fixtures for each provider and malformed/unsafe data cases.
- [ ] Run the adapter tests and confirm the new cases fail.
- [ ] Add the new normalisers while preserving existing output fields.
- [ ] Run the adapter tests and confirm they pass.

### Task 3: Database support

**Files:**
- Create: `supabase/migrations/<generated>_expand_job_intelligence_sources.sql`
- Modify: `src/lib/types.ts`

**Interfaces:**
- Adds provider checks, `market`, and a backward-compatible Unicode-preserving `canonical_fingerprint` while retaining RLS and uniqueness.

- [ ] Generate the migration with `npx supabase migration new expand_job_intelligence_sources`.
- [ ] Add reversible constraint changes and indexed columns with no destructive data rewrite.
- [ ] Run `npx supabase db reset` against the local Docker stack.

### Task 4: KYC source discovery

**Files:**
- Modify: `supabase/functions/enrich-kyc/index.ts`
- Test: `supabase/functions/_shared/jobSourceDiscovery.test.ts`

**Interfaces:**
- Persists `enriched_data.job_source_candidates` from careers search results and official-site links.

- [ ] Add failing fixtures covering careers-page prioritisation and candidate preservation.
- [ ] Add a careers-focused Serper query and feed collected URLs through the pure detector.
- [ ] Confirm KYC still preserves manually edited enriched fields and existing contact behaviour.

### Task 5: Multi-source job refresh

**Files:**
- Modify: `supabase/functions/discover-jobs/index.ts`
- Modify: `supabase/functions/_shared/jobSources.test.ts`

**Interfaces:**
- Fetches direct providers and uses Serper result links for employer-domain and portal sources without crawling their pages.

- [ ] Add failing tests for direct/source-search dispatch, canonical fingerprinting, and non-exhaustive portal closure rules.
- [ ] Implement paginated SmartRecruiters, Ashby, career-page, and portal-search adapters.
- [ ] Keep every company/source/opportunity query explicitly filtered by `owner_id`.
- [ ] Run focused tests and confirm they pass.

### Task 6: Confirmation and grouped UI

**Files:**
- Modify: `src/components/KycPanel.tsx`
- Modify: `src/hooks/useCompany.ts`
- Modify: `src/lib/functions.ts`
- Test: `src/lib/jobIntelligence.test.ts`

**Interfaces:**
- Displays detected candidates, confirms and refreshes in one action, supports all direct and Singapore portal sources, stores market, and groups crossposts under one role with provider links.

- [ ] Add failing helper tests for candidate filtering and grouped role output.
- [ ] Implement candidate confirmation with immediate refresh and query invalidation.
- [ ] Add manual source controls and clear direct-vs-link-only explanations.
- [ ] Render grouped jobs with official/crosspost badges and preserve every apply link.
- [ ] Run focused tests and confirm they pass.

### Task 7: Complete verification

**Files:**
- Review all changed files and generated migration.

**Interfaces:**
- Produces a tested working tree and a user-supplied commit message; does not commit or push.

- [ ] Run `npm test -- --run`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Run `git diff --check` and GitNexus change detection.
- [ ] Review Supabase security/performance advisors without modifying production data.
- [ ] Provide the exact commit message to the user.
