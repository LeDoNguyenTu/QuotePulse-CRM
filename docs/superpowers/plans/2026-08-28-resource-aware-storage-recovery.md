# Resource-Aware Automatic Storage Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan.

**Goal:** Make QuotePulse archive R2-backed payloads and reclaim PostgreSQL TOAST space automatically, before the 500 MB Supabase limit, while keeping Nano disk-I/O work globally bounded and HubSpot imports fail-closed during recovery.

**Architecture:** Keep the existing Supabase `pg_cron` maintenance tick as the runtime scheduler. The Edge archive worker performs at most one round-robin owner batch per tick; a private PostgreSQL reconciliation function observes capacity and quietness, schedules one fixed TOAST-only `VACUUM FULL` command, verifies its result, and backs off safely. A service-role admission RPC is enforced both in `hubspot-ingest` and in the shared browser storage lock.

**Tech Stack:** PostgreSQL 17, Supabase `pg_cron`, Supabase Edge Functions (Deno/TypeScript), Cloudflare R2, React 18, TanStack Query 5, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-28-resource-aware-storage-recovery-design.md`

## Global constraints

- Run GitNexus upstream impact analysis before editing every existing named function, class, or method. Stop and warn before a HIGH or CRITICAL edit unless the user has already accepted that named blast radius.
- Follow red-green-refactor: add a test that fails for the missing behavior, run it to confirm the expected failure, implement the smallest passing change, then rerun the focused suite.
- Preserve per-user ownership filters and service-role-only access. No browser role may call admission or controller RPCs directly.
- Never schedule an automatic main-heap rewrite. The only compaction command is the fixed TOAST-only command for `public.deals`.
- Run `gitnexus detect-changes` before each commit and use non-interactive Git commands.
- Runtime automation must be Supabase-native. GitHub Actions is only the existing deployment path.

## Task 1: Make archival proactive, globally bounded, and round-robin

**Files:**

- Modify: `supabase/functions/storage-maintenance/handler.test.ts`
- Modify: `supabase/functions/storage-maintenance/handler.ts`
- Modify: `supabase/functions/storage-maintenance/index.ts`

1. Add failing policy tests for exact byte-ratio boundaries:

   - `< 0.60`: `safe`, no archive batch.
   - `0.60 <= ratio < 0.75`: `warning`, five-minute cadence, batch 25.
   - `0.75 <= ratio < 0.82`: `high`, one-minute cadence, batch 50.
   - `>= 0.82`: `critical`, one-minute cadence, batch 100.

2. Add failing handler tests proving that a tick:

   - calls `archiveOwner` for only the first returned owner;
   - completes that owner attempt exactly once with whether rows were actually archived;
   - never applies the batch limit once per owner;
   - does not call `recordRun` for a successful zero-owner or zero-work tick;
   - still records errors and releases the lease.

3. Run:

   `npm test -- --run supabase/functions/storage-maintenance/handler.test.ts`

   Confirm failures are the missing `high` pressure band, old thresholds, multi-owner loop, and no-work history insertion.

4. Change `archivePolicy` to return this discriminated shape:

   ```ts
   type ArchivePressure = "safe" | "warning" | "high" | "critical";
   type ArchivePolicy = {
     pressure: ArchivePressure;
     minIntervalMs: number;
     limitPerRun: number;
   };
   ```

   Use `Number.POSITIVE_INFINITY` and `0` below 60%, `5 * 60_000` and `25` below 75%, `60_000` and `50` below 82%, then `60_000` and `100`.

5. Replace the multi-owner loop in `createStorageMaintenanceHandler` with one owner attempt. Add dependency:

   ```ts
   completeOwnerAttempt(ownerId: string, didWork: boolean): Promise<void>;
   ```

   Call it after a successful archive attempt; do not advance it after an R2/archive failure. Insert history only for work, partial/error results, or lease/controller failures.

6. Wire `completeOwnerAttempt` in `index.ts` to a migration-defined service RPC named `complete_storage_archive_owner_attempt`.

7. Rerun the focused test until green.

8. Commit only the worker/test change after `gitnexus detect-changes`:

   `git commit -m "fix: bound automatic storage archival"`

## Task 2: Install the resource-aware PostgreSQL controller

**Files:**

- Create with Supabase CLI: `supabase/migrations/20260827224615_resource_aware_storage_recovery.sql`
- Create beside it: `supabase/migrations/20260827224615_resource_aware_storage_recovery.test.ts`

1. Run `npx supabase migration new resource_aware_storage_recovery`; it generated version `20260827224615`, which is used for both files.

2. Add a failing migration contract test that reads the SQL and asserts all of these literal contracts:

   - capacity thresholds `0.60`, `0.75`, `0.82`, and emergency `0.95` are represented through constants or exact integer byte thresholds;
   - `storage_compaction_state` enables RLS and revokes browser roles;
   - controller functions have a fixed `search_path`;
   - the compaction command contains `FULL`, `SKIP_LOCKED`, `PROCESS_MAIN FALSE`, `PROCESS_TOAST TRUE`, and `public.deals`;
   - no scheduled command contains a plain `VACUUM FULL public.deals` or `PROCESS_MAIN TRUE`;
   - backoff intervals are 15, 30, and 60 minutes;
   - the controller uses a non-blocking advisory lock and inspects `pg_stat_activity`, `pg_stat_progress_vacuum`, and `pg_stat_progress_cluster`;
   - only `service_role` may execute the public status and admission RPCs.

3. Run the new contract test and confirm it fails because the migration is empty.

4. In the migration, extend singleton `storage_archive_state` with `last_owner_id`, `last_archive_work_at`, and `zero_candidate_observations`. Replace `storage_archive_owner_candidates()` with a service-role-only, one-row round-robin function ordered after `last_owner_id` and wrapping once. Add `complete_storage_archive_owner_attempt(uuid, boolean)` to advance the cursor and set `last_archive_work_at` only when work occurred.

5. Create `storage_compaction_state` as a singleton with the states and timestamps from the design, plus attempt count, cron job id, before/after database/deal/TOAST sizes, `last_error`, and `skip_reason`. Enable RLS, revoke all browser privileges, and seed the singleton as `idle`.

6. Add private helpers with `SECURITY DEFINER` and fixed `search_path` to:

   - measure database, deal heap/index, and deal TOAST bytes;
   - detect archive backlog and update the two-observation counter;
   - detect leases, active queries over five seconds, transactions over 30 seconds, and vacuum/cluster work on `public.deals`;
   - deactivate and classify the named compaction cron job from `cron.job_run_details`;
   - calculate retry delays as 15 minutes for attempt 1, 30 for attempt 2, and 60 for all later attempts;
   - schedule the next exact UTC minute with the fixed command:

     ```sql
     VACUUM (
       FULL,
       SKIP_LOCKED,
       PROCESS_MAIN FALSE,
       PROCESS_TOAST TRUE
     ) public.deals;
     ```

7. Implement `private.reconcile_storage_compaction()` with `pg_try_advisory_xact_lock`. It must return without scheduling unless usage is at least 410,000,000 bytes, archive backlog was zero twice, last archive work is at least ten minutes old, no archive lease/compaction is active, quiet checks pass, and either Singapore time is 02:00-06:00 or usage is at least 475,000,000 bytes. It must verify post-run capacity, mark `succeeded` only below 410,000,000 bytes, retry ineffective/skipped work with capped backoff, and mark `failed_closed` rather than scheduling a main-table rewrite after a successful TOAST-only run that remains unsafe.

8. Add service-role-only public RPCs:

   - `storage_compaction_status()` returning sanitized state/status fields for the Edge status function;
   - `storage_import_admission(uuid)` returning `allowed`, `archiving`, `capacity_guard`, `compacting`, or `status_unavailable`, together with used/limit bytes and the compaction state.

   Both use constant-time/index-backed checks and do not expose raw cron SQL or privileged catalog data.

9. Update the existing storage maintenance cron command so each minute invokes the archive Edge Function and then calls `private.reconcile_storage_compaction()`. Keep cron history pruning. The compaction job is created inactive and is activated only by reconciliation.

10. Run the migration contract test until green, then run the entire migration-test set:

    `npm test -- --run supabase/migrations/*.test.ts`

11. Commit the migration/tests after `gitnexus detect-changes`:

    `git commit -m "feat: automate resource-aware database compaction"`

## Task 3: Enforce import admission before HubSpot or database work

**Files:**

- Create: `supabase/functions/_shared/storageAdmission.ts`
- Create: `supabase/functions/_shared/storageAdmission.test.ts`
- Modify: `supabase/functions/hubspot-ingest/index.ts`

1. Add failing unit tests for a new pure `decideStorageAdmission` mapper. It allows only the exact `allowed` RPC decision below 410,000,000 bytes with no active recovery state. It denies `archiving`, `capacity_guard`, `compacting`, malformed data, and RPC errors, returning a retryable user message and HTTP 503 details.

2. Run:

   `npm test -- --run supabase/functions/_shared/storageAdmission.test.ts`

3. Implement the typed mapper and an `assertStorageAdmission(admin, ownerId)` helper that calls `storage_import_admission` once, passes the authenticated owner id explicitly, validates the response, and fails closed on every error or unknown state.

4. In the `hubspot-ingest` request handler, call `assertStorageAdmission` immediately after authentication/admin-client construction and before parsing a rebuild, resolving HubSpot credentials, making remote requests, or writing CRM rows. Return HTTP 503 with `Retry-After: 60` and the shared structured error when denied.

5. Add a source-order regression assertion to the admission test: the admission call must appear before `resolveAccessToken`, `countAll`, and rebuild processing in `hubspot-ingest/index.ts`.

6. Run the focused test and the existing HubSpot shared tests until green.

7. Commit after `gitnexus detect-changes`:

   `git commit -m "fix: fail closed HubSpot imports under storage pressure"`

## Task 4: Surface compaction state and use the same 82% browser lock

**Files:**

- Modify: `supabase/functions/storage-status/handler.test.ts`
- Modify: `supabase/functions/storage-status/handler.ts`
- Modify: `supabase/functions/storage-status/index.ts`
- Modify: `src/lib/functions.ts`
- Modify: `src/lib/storageStatus.test.ts`
- Modify: `src/lib/storageStatus.ts`
- Modify: `src/hooks/useStorageStatus.ts`
- Modify: `src/components/StorageStatusPanel.tsx`

1. Add failing backend status tests for a `compaction` object containing state, attempts, schedule/start/finish/next-retry timestamps, measured before/after bytes, and a sanitized error/skip reason. Verify an unavailable compaction RPC makes the status response explicitly unavailable rather than silently normal.

2. Add failing frontend policy tests proving:

   - import locks at exactly 82%, during archive backlog, and for `scheduled`, `running`, `retry_wait`, or `failed_closed` compaction;
   - import remains fail-closed while status is loading/unavailable;
   - it unlocks only below 82%, zero backlog, and a terminal `idle` or verified `succeeded` state;
   - recovery summaries use automatic cooldown/scheduled/running/retry/complete/fail-closed wording and never instruct manual compaction during a healthy automatic state;
   - `storageStatusPollInterval` returns five minutes normally and one minute at 75% or any active recovery state.

3. Run both focused suites and confirm the old 100% lock threshold and absent compaction response fail.

4. Extend the storage-status handler dependency and response types with `readCompactionStatus`. Wire it in `index.ts` through `storage_compaction_status()` using the service-role client.

5. Extend `StorageStatusResult` in `src/lib/functions.ts` with the typed compaction object. Update `capacityTone`, `storageRecoverySummary`, and `importRecoveryLock` to share constants for 75% polling and 82% import stop. Add the pure `storageStatusPollInterval` helper.

6. Set TanStack Query `refetchInterval` in `useStorageStatus` from the latest query data using `storageStatusPollInterval`; retain five-minute stale time only for the safe state and one-minute polling during pressure/recovery.

7. Update `StorageStatusPanel` to show cooldown, schedule/run, retry, completed, and fail-closed states. Keep the refresh controls, remove the stale instruction that the user must compact manually, and show manual escalation only when state is `failed_closed`.

8. Run focused tests, typecheck, and lint on the touched files until green.

9. Commit after `gitnexus detect-changes`:

   `git commit -m "feat: expose automatic storage recovery status"`

## Task 5: Full verification and change-scope review

**Files:** No intended source changes; fix only regressions directly caused by Tasks 1-4 using TDD.

1. Run focused storage suites:

   `npm test -- --run supabase/functions/storage-maintenance/handler.test.ts supabase/functions/storage-status/handler.test.ts supabase/functions/_shared/storageAdmission.test.ts src/lib/storageStatus.test.ts supabase/migrations/*.test.ts`

2. Run the complete automated checks:

   - `npm test -- --run`
   - `npm run typecheck`
   - `npm run lint`
   - `npm run build`

3. Run local Supabase validation that does not mutate production:

   - `npx supabase db lint --local` when the local stack is available;
   - otherwise parse/validate the migration with the installed CLI and explicitly record that a local Docker database was unavailable.

4. Run GitNexus change detection and inspect every affected process. Confirm changes are limited to storage maintenance/status and HubSpot import admission. Review `git diff --check`, `git status --short`, and the complete branch diff.

5. Perform a security review of grants, RLS, fixed search paths, explicit owner id flow, and fixed SQL command. Verify no secrets or generated local files are staged.

6. Use the verification-before-completion workflow and record exact command outcomes. Do not claim production recovery from local tests.

## Task 6: Publish, monitor deployment, and verify live recovery

**Files:** No new files unless a deployment-caused defect requires a tested follow-up commit.

1. Confirm `gh auth status` is logged into `LeDoNguyenTu`, remote URL is `LeDoNguyenTu/QuotePulse-CRM`, the branch contains only intended commits, and local `main` can be fast-forwarded safely.

2. Push the implementation branch, then integrate it to `main` without rewriting unrelated history. Push `main` to the authorized remote.

3. Monitor the Supabase GitHub workflow to completion. If it fails, inspect the exact migration/function deployment error, fix it with a focused test, commit, push, and monitor again. Confirm Vercel reaches READY for the matching commit.

4. Verify remote migration inventory and Edge Function deployments for `storage-maintenance`, `storage-status`, and `hubspot-ingest`.

5. Inspect live recovery read-only at short intervals while preserving the controller's backoff:

   - compaction singleton state and cron job history;
   - archive candidate count and lease state;
   - active sessions/long transactions/vacuum progress;
   - database, deal heap, indexes, and TOAST sizes before and after;
   - database writability and representative CRM row counts.

6. Verify authenticated behavior through the deployed application:

   - imports are disabled and the UI reports automatic scheduled/running/retry state while unsafe;
   - a direct `hubspot-ingest` request is rejected with 503 before remote HubSpot work;
   - storage status refreshes and contains no manual-compaction instruction during healthy recovery;
   - after live database size falls below 410,000,000 bytes and backlog is zero, import admission automatically returns `allowed` and UI controls re-enable.

7. If the controller reaches `failed_closed`, leave imports blocked and report its measured evidence. Do not run an unplanned full main-table rewrite.

8. Hand off the pushed commit hashes, GitHub workflow/deployment results, live before/after measurements, authenticated behavior proof, and any provider limitation. Only say recovery is complete if the live database is below 410,000,000 bytes with zero archive backlog and import admission is allowed.
