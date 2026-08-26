# R2-First Storage Recovery Design

## Goal

Return the QuotePulse Supabase database below the 500 MB Free-plan quota without
upgrading, keep it below that quota during future HubSpot synchronization, and
preserve the existing searchable CRM and owner-isolation behavior.

## Confirmed production state

As measured on 2026-08-26, the database is 736,062,611 bytes. The `deals`
relation is 479 MB, including 353 MB of TOAST storage. There are 87,400 deals
with non-empty `hubspot_properties` waiting for archive, representing about
242 MB of live JSON. The archive worker normally succeeds but moves only 200
deals every five minutes. PostgreSQL has approximately 176 MB of WAL, so an
immediate `VACUUM FULL` does not have safe temporary headroom.

## Scope

This recovery changes only raw HubSpot snapshot storage and related maintenance.
Supabase remains authoritative for Auth, ownership, companies, contacts,
searchable deal fields, email, KYC, archive pointers, and sync cursors. R2 remains
private and is accessed only through owner-enforcing Edge Functions.

The work has three independently verifiable stages:

1. Prevent new JSON bloat with an R2-first import and property-repair flow.
2. Drain the existing archive backlog faster without overlapping workers.
3. Reclaim already allocated PostgreSQL space using a guarded, explicit
   maintenance command after the backlog reaches zero.

## R2-first snapshot writes

### New and modified deals

`hubspot-ingest` must never persist a full raw HubSpot snapshot in
`deals.hubspot_properties` during ordinary processing. It will:

1. Construct the complete snapshot in Edge Function memory.
2. Write it to an immutable owner-scoped R2 key.
3. Read it back and verify its checksum using the existing archive helper.
4. Upsert the lean relational deal fields plus the verified R2 pointer and
   property schema version in Supabase, keeping `hubspot_properties = '{}'`.

If R2 upload or verification fails, the deal is treated as failed and the page
cursor or incremental watermark does not advance. Existing Supabase data remains
unchanged and the source object is retried later. An R2 object whose subsequent
database finalization fails is a harmless orphan and may be cleaned separately;
unverified data is never referenced or used to clear Postgres data.

### Historical property repair

The property repair sweep will no longer call a database function that merges
the complete snapshot into `hubspot_properties` and invalidates the old pointer.
Instead it will write one verified R2 batch for the repair page, then call a new
service-role-only, security-invoker RPC that atomically updates each matching
deal's R2 key, checksum, archive timestamp, and schema version while leaving the
JSON column empty.

The RPC must compare the expected `hubspot_modified_at` before updating a row.
Rows changed concurrently are not finalized and remain eligible for retry. Its
execute privilege is revoked from `PUBLIC`, `anon`, and `authenticated` and
granted only to `service_role`.

### Archive reads

Existing `deal-archive-properties` read-through remains the only browser path to
full raw properties. It continues to authenticate the Supabase JWT, verify row
ownership, validate the owner-scoped R2 key, fetch the archive object, and verify
the stored checksum. Batch and individual archive formats remain readable.

## Backlog drain

The archive worker retains its database lease and its 200-deal R2 batch size.
Under critical pressure, the cron trigger runs once per minute instead of every
five minutes. Warning pressure remains throttled to one run per fifteen minutes,
and safe pressure remains idle. A ten-minute lease prevents overlap if a worker
runs long.

This changes the ideal 87,400-row drain time from about 36 hours to about 7.3
hours while keeping each Edge invocation and database transaction bounded. The
worker must continue recording success, warnings, and failures, and it must back
off naturally when a prior lease is still active.

The migration also limits future `cron.job_run_details` growth and removes its
existing operational history. This history contains cron execution telemetry,
not CRM data, and currently consumes about 31 MB. No CRM, Auth, email, or R2
archive records are deleted.

## Physical space reclamation

Archiving makes TOAST tuples dead but does not reduce `pg_database_size`.
Physical compaction is therefore a separate maintenance operation, never an
automatic Edge Function action or schema migration.

A versioned `scripts/recover-supabase-storage.sql` psql script will:

1. Stop immediately unless there are zero deals with a non-empty
   `hubspot_properties` snapshot, and every archived deal pointer has a complete
   key, checksum, and archive timestamp.
2. Stop unless the database is writable and no HubSpot/archive write query is
   active.
3. Report database, WAL, deals relation, and pending-archive sizes.
4. Require a conservative temporary-headroom threshold before continuing.
5. Issue a checkpoint, compact `public.deals` with `VACUUM (FULL, ANALYZE)`, and
   print the post-operation sizes.
6. Fail if the resulting database remains at or above 500,000,000 bytes.

The script is deliberately manual because `VACUUM FULL` takes an exclusive lock
and cannot run inside a migration transaction. If the headroom check fails, it
must not attempt compaction. The fallback is to wait for WAL to settle and retry
during a quiet maintenance window; an offline table rebuild is out of scope
because it would carry substantially greater foreign-key and recovery risk.

Run it only after pausing HubSpot import activity, using a direct privileged psql
connection:

```bash
psql "$SUPABASE_DB_URL" -f scripts/recover-supabase-storage.sql
```

The script exits before `VACUUM FULL` if any archive, writer, read-only, or disk
headroom guard fails. Imports must remain paused until the script reports
`Recovery succeeded` and the post-recovery checks finish.

## User-visible status

Storage status will distinguish three facts:

- snapshots still waiting to move to R2;
- snapshots logically archived but physical compaction still required;
- database physically below quota.

It must not imply that database capacity falls immediately after an archive
batch. Archive errors must render their actual message rather than
`[object Object]`.

## Failure and rollback behavior

- R2 failure: do not finalize the pointer or advance the sync cursor.
- Database finalization failure: retain the prior database row and retry; the R2
  object may remain orphaned.
- Concurrent HubSpot modification: reject that row from batch finalization and
  retry it with a fresh snapshot.
- Archive-worker timeout: lease expiry permits a later retry; batches are
  idempotent at the database finalization boundary.
- Compaction preflight failure: perform no table rewrite.
- Compaction interruption: PostgreSQL retains the original relation; verify the
  database before reopening imports.

## Verification

Automated tests must cover R2-first deal persistence, R2-first property repair,
timestamp conflict rejection, cursor/watermark retention on R2 failure, critical
archive scheduling, archive error formatting, and recovery-script preflight
queries. Existing owner-isolation, archive checksum, R2 key, import, storage
status, typecheck, lint, and build suites must remain green.

Before physical compaction, live read-only checks must confirm zero pending
snapshots, complete pointers, no active writers, and sufficient headroom. After
compaction, verify `pg_database_size(current_database()) < 500000000`, R2 pointer
integrity, representative archive read-through, CRM counts, and an authenticated
browser smoke test.

## Success criteria

- Normal HubSpot synchronization never stores full snapshots in Postgres.
- Historical property repair writes verified snapshots directly to R2.
- The archive backlog reaches zero without overlapping workers or data loss.
- Full properties remain readable through the authenticated archive endpoint.
- The guarded maintenance operation returns the production database below
  500,000,000 bytes.
- Core CRM counts and owner isolation remain unchanged.
