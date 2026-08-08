# Dashboard and Durable Email Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make dashboard reads scalable and deterministic, make structured errors safe and useful, and deliver a durable consent-aware Graph/Brevo email queue.

**Architecture:** Keep `company_dashboard` as an RLS-respecting normal view with owner-scoped grouped aggregates. Move queue scheduling and locking into Postgres, invoke a bounded worker through Supabase Cron, and isolate sending providers behind a server-only interface.

**Tech Stack:** React 18, TanStack Query 5, TypeScript, Vitest, Supabase Postgres/RLS/RPC/Cron/Vault, Deno Edge Functions, Microsoft Graph, Brevo API.

## Global Constraints

- Do not commit, push, deploy, merge, or modify production data.
- Preserve the existing `.env.example` user change.
- Use only new timestamped migrations; do not alter deployed migrations.
- Preserve owner isolation on every service-role read and write.
- Never expose provider credentials, auth tokens, database URLs, or recipient identifiers in errors or unsubscribe URLs.
- Microsoft Graph remains the default provider; Brevo is optional and server-side only.

---

## File Structure

- `src/lib/error.ts`: frontend-safe structured error normalization and redaction.
- `src/lib/companyPagination.ts`: pure normalized filters, keys, ranges, and deterministic order descriptors.
- `src/lib/emailQueue.ts`: pure cooldown schedule, retry classification, quota, and email-normalization helpers.
- `src/hooks/useCompanies.ts`: split page/count queries and next-page prefetch.
- `src/hooks/useEmailQueue.ts`: authenticated enqueue RPC and queue status query; no drain loop.
- `src/components/{ui,BulkSendPanel}.tsx`, `src/pages/{Dashboard,Settings}.tsx`: safe errors, navigation state, consent, queue visibility, conservative settings.
- `supabase/migrations/20260808130000_0008_dashboard_queue_hardening.sql`: optimized view, indexes, durable queue, RLS, RPCs, suppression, tokens, and secure cron registration.
- `supabase/functions/_shared/{errors,emailProviders}.ts`: server error normalization and Graph/Brevo provider implementations.
- `supabase/functions/{process-email-queue,unsubscribe}/index.ts`: cron-authenticated worker and opaque-token public endpoint.
- `supabase/config.toml`, `.github/workflows/supabase.yml`, `README.md`: function deployment, CI test gate, secrets, Vault, and manual configuration documentation.
- `src/**/*.test.ts`: focused Vitest suites for pure UI/queue rules.

### Task 1: Test harness and pure rules

**Files:**
- Create: `vitest.config.ts`, `src/lib/error.ts`, `src/lib/companyPagination.ts`, `src/lib/emailQueue.ts`, and their `*.test.ts` files.
- Modify: `package.json`.

**Interfaces:**
- Produces `normalizeError(error): NormalizedError`, `companyPageKey(filters)`, `companyCountKey(filters)`, `companyRange(page, pageSize)`, `scheduleRecipients(start, count, cooldownSeconds)`, `classifyProviderFailure(input)`, and `normalizeEmail(email)`.

- [ ] **Step 1: Write failing tests**

```ts
expect(normalizeError({ message: 'missing last_deal_at', code: '42703', hint: 'apply 0007' }).message)
  .toBe('missing last_deal_at');
expect(companyCountKey({ search: 'a', page: 2, pageSize: 25 })).toEqual(['company-count', { search: 'a' }]);
expect(scheduleRecipients(new Date('2026-01-01T00:00:00Z'), 3, 30)).toHaveLength(3);
expect(classifyProviderFailure({ status: 429, retryAfterSeconds: 60 }).retryable).toBe(true);
```

- [ ] **Step 2: Run the new tests and confirm they fail because these exports do not exist.**

Run: `npm test -- --run src/lib/error.test.ts src/lib/companyPagination.test.ts src/lib/emailQueue.test.ts`

- [ ] **Step 3: Add minimal pure implementations and Vitest scripts/configuration.**

- [ ] **Step 4: Run the focused tests and confirm all pass.**

### Task 2: Database migration and query-plan fixture

**Files:**
- Create: `supabase/migrations/20260808130000_0008_dashboard_queue_hardening.sql`, `supabase/tests/dashboard_queue_hardening.sql`.

**Interfaces:**
- Produces `company_dashboard`, `queue_bulk_email`, `claim_due_email_sends`, `record_unsubscribe`, `email_suppressions`, and `email_unsubscribe_tokens`.

- [ ] **Step 1: Write SQL assertions for view columns, owner-scoped queue claims, suppression rejection, and concurrent claim exclusivity.**

```sql
select plan(5);
select ok(to_regclass('public.email_suppressions') is not null, 'suppression table exists');
select is((select count(*) from public.claim_due_email_sends(10)), 0::bigint, 'empty queue claims nothing');
```

- [ ] **Step 2: Run the SQL assertion file against the current local schema and confirm it fails because the functions/tables do not exist.**

- [ ] **Step 3: Add migration 0008.**

The migration must drop/recreate the view using grouped owner/company CTEs; add only composite indexes supporting aggregation, claim eligibility, and latest-row ordering; extend `send_status`; set conservative defaults; create owner-RLS suppression/token tables; harden all function search paths/grants; create atomic `FOR UPDATE SKIP LOCKED` claim and authenticated enqueue RPCs; and install a Vault-backed one-minute cron job.

- [ ] **Step 4: Reset local Supabase, run the SQL assertions, and capture `EXPLAIN (ANALYZE, BUFFERS)` for the old-equivalent correlated query and new view query using a generated fixture only when Docker is available.**

### Task 3: Dashboard page/count separation

**Files:**
- Modify: `src/hooks/useCompanies.ts`, `src/pages/Dashboard.tsx`, `src/components/CompaniesTable.tsx`.
- Test: `src/lib/companyPagination.test.ts`.

**Interfaces:**
- Consumes Task 1 query keys/ranges/order descriptors.
- Produces `useCompanies()` with `pageQuery`, `countQuery`, `isFetching`, `isPlaceholderData`, and deterministic page data.

- [ ] **Step 1: Add tests proving count keys exclude page, ranges use the configured page size, and the stable final order is `id`.**
- [ ] **Step 2: Run them and confirm failure against current hook behavior.**
- [ ] **Step 3: Implement separate page/count queries, filter resets, current-page clamp, error display, previous-page preservation, navigation overlay, duplicate-Next prevention, and next-page prefetch.**
- [ ] **Step 4: Run focused tests and TypeScript checking.**

### Task 4: Structured errors in browser and server

**Files:**
- Modify: `src/components/ui.tsx`, `src/lib/functions.ts`, `src/pages/Dashboard.tsx`, `src/components/BulkSendPanel.tsx`, `src/pages/Settings.tsx`.
- Create: `supabase/functions/_shared/errors.ts`.
- Modify: relevant Edge Functions currently using `String(error)`.

**Interfaces:**
- Consumes `NormalizedError` from Task 1 and Deno `safeErrorMessage(error)`.
- Produces message-first UI with optional redacted technical details and never renders `[object Object]`.

- [ ] **Step 1: Add failing UI-normalization tests for `Error`, PostgREST shape, strings, null, unknown objects, and secret redaction.**
- [ ] **Step 2: Run them and confirm current `String(error)` behavior fails.**
- [ ] **Step 3: Implement the normalizers and replace obvious unsafe formatting paths.**
- [ ] **Step 4: Re-run focused tests.**

### Task 5: Durable providers, worker, and unsubscribe endpoint

**Files:**
- Create: `supabase/functions/_shared/emailProviders.ts`, `supabase/functions/unsubscribe/index.ts`.
- Modify: `supabase/functions/_shared/ms.ts`, `supabase/functions/process-email-queue/index.ts`, `supabase/config.toml`.
- Test: `src/lib/emailQueue.test.ts` plus SQL tests from Task 2.

**Interfaces:**
- `sendProviderEmail(provider, input): Promise<ProviderSendResult>` returns `sent`, `retryable`, `ambiguous`, `providerMessageId`, `retryAfterSeconds`, and safe details.
- Worker accepts only Vault-secret cron requests, calls `claim_due_email_sends`, processes a bounded batch without sleeping, and updates only `id + created_by` rows.
- Unsubscribe accepts only an opaque token and returns an idempotent response.

- [ ] **Step 1: Add failing tests for 429/5xx retry, permanent failure, cooldown schedule, quota, suppression matching, token expiry/revocation, and no duplicate retry after ambiguous send.**
- [ ] **Step 2: Run them and confirm expected failures.**
- [ ] **Step 3: Implement Graph MIME mail with List-Unsubscribe headers, complete Brevo transactional API support using `BREVO_API_KEY`, and the server-only provider selector.**
- [ ] **Step 4: Implement the scheduled queue worker and public unsubscribe endpoint with token hashing and idempotent suppression.**
- [ ] **Step 5: Run tests and local SQL checks.**

### Task 6: Consent-aware UI and configuration

**Files:**
- Modify: `src/lib/types.ts`, `src/hooks/useSettings.ts`, `src/hooks/useEmailQueue.ts`, `src/components/BulkSendPanel.tsx`, `src/pages/Settings.tsx`, `src/pages/CompanyDetail.tsx` as needed.

**Interfaces:**
- Queue UI shows queued/scheduled/sending/retrying/sent/failed/blocked, next attempt, and quota.
- Bulk sending requires `recipientConsentConfirmed: true` and receives RPC enqueue results.

- [ ] **Step 1: Add a failing test for aggressive-setting warnings and required consent confirmation.**
- [ ] **Step 2: Run it and confirm current UI admits unconfirmed queueing.**
- [ ] **Step 3: Implement conservative 50/day and 60-second defaults, strong-setting warnings, explicit confirmation, no browser drain, provider selector, and queue observability.**
- [ ] **Step 4: Run the relevant tests and `npm run typecheck`.**

### Task 7: Automation, documentation, and final verification

**Files:**
- Modify: `.github/workflows/supabase.yml`, `README.md`, `package.json`.

- [ ] **Step 1: Add a CI quality job that runs `npm ci`, tests, typecheck, lint, and build before the existing main-only deploy job. Add `unsubscribe` to the deployed function list.**
- [ ] **Step 2: Document required GitHub Actions secrets, Supabase function secrets, Vault values, and Supabase Dashboard setup for cron/Vault/URL configuration.**
- [ ] **Step 3: Run `npm install`, `npm test -- --run`, `npm run typecheck`, `npm run lint`, `npm run build`, and `supabase db reset` when available.**
- [ ] **Step 4: Run GitNexus change detection and inspect the final diff. Do not commit.**
