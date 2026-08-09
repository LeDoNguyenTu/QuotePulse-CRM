# HubSpot Timestamp, Files, and Session Timeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent blank HubSpot timestamps from failing sync, suppress unsupported Files work safely, deduplicate retry errors, and add a per-user configurable idle sign-out.

**Architecture:** Pure helpers normalize source timestamps and idle-timeout values so their edge cases are unit-testable. The HubSpot ingestion context disables Files metadata calls while preserving attachment rows. A constrained `user_settings` column persists the timeout, and `AuthProvider` reads it independently to configure the existing idle timer.

**Tech Stack:** React 18, TypeScript, TanStack Query, Supabase Postgres/Auth/Edge Functions, Vitest.

## Global Constraints

- Do not query or modify production customer data.
- Preserve existing attachment rows and continue recording newly discovered attachment references.
- Keep Supabase automatic access-token refresh enabled.
- Default session timeout is 120 minutes; 0 means disabled; nonzero values must be 5 through 10,080 minutes.
- Do not commit, push, or deploy; the user will commit and push.

---

### Task 1: Normalize HubSpot timestamps and unique import errors

**Files:**
- Create: `supabase/functions/_shared/hubspotTimestamps.ts`
- Create: `supabase/functions/_shared/hubspotTimestamps.test.ts`
- Modify: `supabase/functions/hubspot-ingest/index.ts`
- Modify: `src/lib/importSession.ts`
- Modify: `src/lib/importSession.test.ts`

**Interfaces:**
- Produces: `nullableHubspotTimestamp(value: unknown): string | null`
- Produces: `accumulateImportResult` with stable first-seen unique errors and warnings.

- [ ] **Step 1: Write failing tests for blank, invalid, and valid timestamp inputs and duplicate errors.**
- [ ] **Step 2: Run the focused Vitest files and verify failures are caused by the missing behavior.**
- [ ] **Step 3: Implement `nullableHubspotTimestamp`, use it for both deal timestamp columns, and deduplicate accumulated errors.**
- [ ] **Step 4: Run the focused tests and verify they pass.**

### Task 2: Disable unsupported HubSpot Files metadata work

**Files:**
- Modify: `supabase/functions/hubspot-ingest/index.ts`
- Create: `supabase/functions/_shared/hubspotFiles.test.ts`

**Interfaces:**
- Produces: exported `HUBSPOT_FILE_METADATA_ENABLED` feature switch set to `false`.
- Consumes: existing `Ctx.filesAllowed`, `resolveFile`, `repairMissingAttachmentMetadata`, and placeholder attachment persistence.

- [ ] **Step 1: Write a source-level regression test proving metadata is disabled while placeholder attachment saving remains present.**
- [ ] **Step 2: Run the focused test and verify it fails because the switch does not exist.**
- [ ] **Step 3: Initialize the import context from the disabled switch without changing or deleting the shared Files helper.**
- [ ] **Step 4: Run the focused test and verify it passes.**

### Task 3: Persist and apply a configurable idle timeout

**Files:**
- Create: `supabase/migrations/<timestamp>_session_timeout_setting.sql`
- Create: `src/lib/sessionTimeout.ts`
- Create: `src/lib/sessionTimeout.test.ts`
- Modify: `src/lib/types.ts`
- Modify: `src/hooks/useIdleTimeout.ts`
- Modify: `src/hooks/useAuth.tsx`
- Modify: `src/hooks/useSettings.ts`
- Modify: `src/pages/Settings.tsx`
- Modify: `src/pages/Login.tsx`

**Interfaces:**
- Produces: `DEFAULT_SESSION_TIMEOUT_MINUTES`, `MIN_SESSION_TIMEOUT_MINUTES`, `MAX_SESSION_TIMEOUT_MINUTES`, `sessionTimeoutMs(minutes)`.
- Produces: `useIdleTimeout({ enabled, timeoutMs, onTimeout })` where `timeoutMs: number | null` and `null` disables the timer.
- Produces: `UserSettings.session_timeout_minutes: number`.

- [ ] **Step 1: Write failing pure tests for default, disabled, minimum, maximum, and invalid timeout values.**
- [ ] **Step 2: Run the focused test and verify it fails because the helper does not exist.**
- [ ] **Step 3: Generate the migration with Supabase CLI and add the default plus database check constraint.**
- [ ] **Step 4: Implement the timeout helper and make the idle hook accept a dynamic timeout.**
- [ ] **Step 5: Load the current owner's timeout in `AuthProvider`, invalidate it when Settings saves, and add the Settings UI.**
- [ ] **Step 6: Run focused tests and typecheck.**

### Task 4: Verify the complete change

**Files:**
- Verify all files above; do not alter production data.

**Interfaces:**
- Consumes: all prior task outputs.

- [ ] **Step 1: Run `npx supabase db reset` against the local Docker-backed stack and assert the new schema.**
- [ ] **Step 2: Run `npm test -- --run`.**
- [ ] **Step 3: Run `npm run typecheck`, `npm run lint`, and `npm run build`.**
- [ ] **Step 4: Exercise the local Settings timeout control with synthetic data only.**
- [ ] **Step 5: Run `npx gitnexus detect-changes -r Client` and inspect `git diff --check` plus `git diff`.**
- [ ] **Step 6: Provide the user with deployment notes and one commit message; do not commit or push.**
