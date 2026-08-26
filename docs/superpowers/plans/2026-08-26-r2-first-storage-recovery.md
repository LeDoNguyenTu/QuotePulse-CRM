# R2-First Supabase Storage Recovery Implementation Plan

> Execute this plan inline with test-driven development. Do not commit or push
> unless the user separately authorizes Git publication.

**Goal:** Stop HubSpot synchronization from writing full deal snapshots to
Postgres, drain the existing snapshot backlog through R2, reclaim physical
database space safely, and expose recovery state accurately in the UI.

**Architecture:** Upload and checksum-verify every new or repaired deal snapshot
in private, owner-scoped R2 before making a short atomic Supabase update. Keep
relational CRM fields and R2 metadata in Postgres, use compare-and-set SQL for
repair batches, retain the authenticated archive read-through, and perform the
exclusive physical rewrite only through a guarded manual script.

**Stack:** TypeScript/Deno Edge Functions, Supabase/Postgres migrations and RPCs,
Cloudflare R2 S3 API, React/Vite, Vitest, psql.

---

## Task 1: Establish pre-change safety and test seams

**Files:**
- Inspect: `supabase/functions/hubspot-ingest/index.ts`
- Inspect: `supabase/functions/_shared/r2Archive.ts`
- Create: `supabase/functions/_shared/dealSnapshotPersistence.ts`
- Create: `supabase/functions/_shared/dealSnapshotPersistence.test.ts`

1. Run GitNexus upstream impact analysis for `processDeal`,
   `sweepDealPropertyBackfill`, `dealPropertyBackfillCandidates`,
   `createStorageMaintenanceHandler`, `createStorageStatusHandler`,
   `archiveAutomationSummary`, and `StorageStatusPanel` before editing them.
2. Warn before proceeding if any impact result is HIGH or CRITICAL.
3. Write failing unit tests for a dependency-injected persistence helper proving:
   R2 upload precedes database upsert; the upsert contains empty
   `hubspot_properties` plus the verified key/checksum/archive time/schema;
   upload failure performs no database write; database failure is surfaced after
   upload as a safe orphan; and owner-scoped keys use the HubSpot ID so new rows
   need no preliminary Postgres insert.
4. Run `npx vitest run supabase/functions/_shared/dealSnapshotPersistence.test.ts`
   and confirm the expected RED failure.
5. Implement the smallest helper API that makes those tests pass, delegating the
   actual upload to `putVerifiedArchive` and leaving the database operation as an
   injected callback.
6. Re-run the focused test and confirm GREEN.

## Task 2: Make normal deal import R2-first

**Files:**
- Modify: `supabase/functions/hubspot-ingest/index.ts`
- Modify: `supabase/functions/_shared/dealSnapshotPersistence.test.ts`

1. Add a failing test case for the exact lean deal payload constructed after a
   verified archive, including timestamps and replacement of an older pointer.
2. In `processDeal`, construct the immutable R2 key from owner ID, HubSpot deal
   ID, and HubSpot modified time; upload and verify the individual snapshot;
   then perform one existing conflict-safe deal upsert containing relational
   fields, `{}` for raw properties, and the new R2 metadata.
3. Remove the current write-hot-JSON-then-finalize sequence and its warning-only
   fallback. An R2 failure must throw, preventing deal completion and allowing
   the existing page/cursor logic to retry without advancing past a failed page.
4. Preserve explicit `owner_id` on every service-role read and write.
5. Run the focused persistence tests plus existing R2/archive tests.

## Task 3: Make historical property repair R2-first in bounded batches

**Files:**
- Modify: `supabase/functions/_shared/dealSnapshotPersistence.ts`
- Modify: `supabase/functions/_shared/dealSnapshotPersistence.test.ts`
- Modify: `supabase/functions/hubspot-ingest/index.ts`
- Create: `supabase/migrations/20260826HHMMSS_r2_first_storage_recovery.sql`

1. Write failing tests for a batch helper proving that one verified batch object
   contains database deal ID, HubSpot deal ID, expected modified time, and full
   properties for each row, and that finalization is not called after R2 failure.
2. Extend property-backfill candidate lookup to retain database IDs and expected
   `hubspot_modified_at` values while filtering by `owner_id`.
3. Upload each hydrated repair page as one owner-scoped deal-batch object, verify
   it, then call a new `finalize_hubspot_deal_property_archive_batch` RPC.
4. Define that `security invoker` RPC in the timestamped migration. Use one short
   `UPDATE ... FROM jsonb_to_recordset(...)` compare-and-set statement matching
   owner ID, database ID, HubSpot ID, and expected modified timestamp. Set schema
   version and verified R2 metadata while keeping `hubspot_properties = '{}'`.
5. Revoke execution from `PUBLIC`, `anon`, and `authenticated`; grant only
   `service_role`. Add SQL comments documenting the R2-before-DB invariant.
6. Ensure partial finalization is reported as a retryable conflict and does not
   advance the property-repair cursor.
7. Run focused tests and static SQL checks for function security, owner predicate,
   timestamp predicate, empty JSON, and privilege statements.

## Task 4: Accelerate archive drain and bound operational telemetry

**Files:**
- Modify: `supabase/functions/storage-maintenance/handler.test.ts`
- Modify: `supabase/functions/storage-maintenance/handler.ts`
- Modify: `supabase/migrations/20260826HHMMSS_r2_first_storage_recovery.sql`

1. Add failing policy tests showing critical pressure runs on every one-minute
   cron tick with a 200-deal bound, warning pressure runs only once per fifteen
   minutes, safe pressure is idle, and structured thrown objects become useful
   messages instead of `[object Object]`.
2. Add a shared robust unknown-error formatter or strengthen the local formatter
   so Supabase error objects prefer `message`, `details`, `hint`, and `code`.
3. Keep the ten-minute database lease and 200-row critical batch unchanged.
4. In the migration, unschedule and recreate `storage-pressure-r2-archive` with
   `* * * * *`. Preserve Vault-derived URL/secret validation.
5. Add bounded cleanup for `cron.job_run_details` and immediately remove existing
   cron execution telemetry only. Do not touch CRM, Auth, email, archive-run, or
   R2 manifest records.
6. Retain the existing bounded `storage_archive_runs` history.
7. Run focused storage-maintenance tests and inspect the migration for destructive
   scope before continuing.

## Task 5: Report logical archive state separately from physical capacity

**Files:**
- Modify: `supabase/functions/storage-status/handler.test.ts`
- Modify: `supabase/functions/storage-status/handler.ts`
- Modify: `supabase/functions/storage-status/index.ts`
- Modify: `src/lib/functions.ts`
- Modify: `src/lib/storageStatus.test.ts`
- Modify: `src/lib/storageStatus.ts`
- Modify: `src/components/StorageStatusPanel.tsx`
- Modify: `supabase/migrations/20260826HHMMSS_r2_first_storage_recovery.sql`

1. Add failing handler and UI-helper tests for three states: pending snapshots;
   backlog zero but database still above quota and requiring compaction; database
   below quota and normal. Also test structured archive errors.
2. Add a service-role-only, owner-filtered storage-status RPC returning pending
   snapshots and archived snapshot counts without exposing other owners' data.
3. Have `storage-status` retain the authenticated user ID and read that owner's
   logical archive status with an explicit owner predicate/RPC argument.
4. Extend frontend response types and pure summary helpers.
5. Update the panel copy so it never claims a 200-row archive batch immediately
   reduced allocated database bytes. Show the next required action clearly.
6. Run the focused handler/helper tests, then the component-related test subset.

## Task 6: Add guarded physical recovery tooling

**Files:**
- Create: `scripts/recover-supabase-storage.sql`
- Create: `scripts/recover-supabase-storage.test.ts`
- Modify: `package.json`
- Modify: `docs/superpowers/specs/2026-08-26-r2-first-storage-recovery-design.md`

1. Write failing source-contract tests requiring psql fail-fast mode, zero hot
   snapshots, complete archive metadata, writable database, no active
   HubSpot/archive writers, reported database/WAL/relation sizes, a conservative
   headroom gate, `CHECKPOINT`, `VACUUM (FULL, ANALYZE) public.deals`, and a final
   `< 500000000` assertion.
2. Implement the manual psql script using `\gset`, `\if`, and explicit `\quit`
   guards. Do not place `VACUUM FULL` inside a transaction.
3. Add a package script that runs only the source-contract test; do not add an
   automatic production compaction command.
4. Document that imports should be paused for the maintenance window and that a
   failed headroom check performs no rewrite.
5. Run the recovery-script contract test and `git diff --check`.

## Task 7: Full verification and production-safe handoff

**Files:**
- Verify all changed files

1. Run focused unit tests after each task, then `npm test -- --run`.
2. Run `npm run typecheck`, `npm run lint`, and `npm run build` with fresh output.
3. Run `supabase db lint --local` and local migration reset/tests when the local
   Supabase stack is available; otherwise record the exact unavailable check.
4. Run GitNexus `detect_changes(scope: "all")`; inspect every affected process
   and resolve unintended blast radius before handoff.
5. Review the final diff for owner isolation, service-role privileges, bounded
   database transactions, cursor behavior, and destructive SQL scope.
6. If production credentials/CLI are available, deploy through the established
   CI/CLI path, verify migrations and Edge Functions, pause import, wait for zero
   pending snapshots and WAL headroom, then run the guarded recovery script.
7. After compaction, verify database size below 500,000,000 bytes, representative
   authenticated R2 read-through, CRM row counts, import retry behavior, storage
   status copy, and browser smoke flow. Never claim production is normal from
   local tests alone.
8. Leave changes uncommitted unless the user explicitly authorizes commit/push.
