# Resource-Aware Automatic Storage Recovery Design

## Goal

Keep QuotePulse below the Supabase Free-plan database limit with the least
possible operator effort while protecting the Nano compute unit from the disk-I/O
bursts that previously made the project slow or unresponsive.

The steady state must be self-maintaining: HubSpot snapshots go to R2 first,
archive work is rate-limited, imports fail closed before capacity is exhausted,
and physical PostgreSQL space is reclaimed automatically only when the database
is quiet enough to do so safely.

## Confirmed production state

As measured on 2026-08-28:

- `pg_database_size` is approximately 716 MB against the 500 MB Free-plan limit.
- There are zero non-empty deal snapshots left to archive and zero archive-owner
  candidates.
- `public.deals` occupies approximately 511 MB.
- Approximately 370 MB of that relation is its TOAST relation, left allocated
  after the archived JSON values were replaced with empty JSON.
- The live deal heap is approximately 66 MB and its indexes approximately 74 MB.
- No `VACUUM FULL` is running, the database is writable, and the latest archive
  ticks are successful no-work runs.
- R2-first persistence is already deployed for new and repaired deal snapshots,
  so this legacy TOAST backlog should not recur at the same scale.

The current archive automation is functional but resource-unaware in two ways:
it can apply its batch limit independently to every candidate owner in one tick,
and it records a new run every minute even when there is no work. It also has no
physical compaction stage.

## Resource constraints

Nano has shared CPU, limited memory, and burstable disk I/O. Once the provider's
Disk I/O Budget is exhausted, the database falls back to its lower baseline and
can accumulate CPU I/O wait, slow queries, and delayed autovacuum work.

Supabase does not expose the remaining Disk I/O Budget as a SQL value that a
database cron controller can safely consume. The controller must therefore use
conservative local signals and hard concurrency limits rather than pretending it
can measure the provider credit balance directly.

The following invariants apply:

1. At most one archive batch is issued per maintenance tick across all owners.
2. Import, archive, and physical compaction never intentionally overlap.
3. Physical compaction is one-shot and state-driven, never an unconditional
   nightly rewrite.
4. A busy or ambiguous database causes the job to skip and retry later.
5. Imports remain blocked until storage recovery is verified complete.

## Capacity and workload policy

The controller uses the 500,000,000-byte application limit and four bands:

| Database usage | Import admission | Archive cadence | Global batch budget |
|---|---|---|---|
| Below 60% | Allowed | Idle unless a legacy backlog is explicitly present | 0 |
| 60% to below 75% | Allowed | Once every five minutes | 25 |
| 75% to below 82% | Allowed | Once per minute | 50 |
| 82% or higher | Blocked | Once per minute | 100 |

The 82% stop threshold is approximately 410 MB and leaves about 90 MB before the
Free-plan database limit. It is enforced independently by the browser and by
`hubspot-ingest`; a stale or modified client cannot bypass it.

The archive worker selects one candidate owner per tick. A cursor in the existing
maintenance state advances after each attempt so multiple owners receive
round-robin service without multiplying work in one invocation. The existing
lease remains the non-overlap boundary.

Only state transitions, failures, degraded runs, or periodic hourly heartbeats
are retained. Successful zero-owner ticks do not insert archive history rows.
Cron execution history is pruned automatically to a bounded retention window.

## Automatic compaction controller

### State

A service-only singleton `storage_compaction_state` records:

- `state`: `idle`, `cooldown`, `scheduled`, `running`, `retry_wait`,
  `succeeded`, or `failed_closed`;
- request, schedule, start, finish, and next-retry timestamps;
- attempt count and the active `pg_cron` job ID;
- database and deal/TOAST bytes before and after the attempt;
- the last error or skip reason.

RLS is enabled. Browser roles receive no table privileges. A narrow
service-role-only status RPC exposes only the fields needed by `storage-status`.

### Reconciliation

The existing storage cron tick also invokes a private PostgreSQL reconciliation
function. The function uses a non-blocking advisory lock and returns immediately
if another reconciliation is active.

Compaction becomes eligible only when all of these are true:

1. Database usage is at least 82%.
2. Archive candidates are zero on two consecutive maintenance observations.
3. At least ten minutes have passed since the last successful archive write.
4. The archive and import leases are free and no compaction is already active.
5. No transaction has been open for more than 30 seconds.
6. No non-maintenance database query has been active for more than five seconds.
7. No vacuum, cluster, or autovacuum operation is active on `public.deals`.
8. The retry backoff and maintenance-window policy allow an attempt.

Normal compaction is attempted during 02:00-06:00 Asia/Singapore. At 95% or
higher, the controller may use the next quiet opportunity outside that window,
but it never relaxes the concurrency, cooldown, archive-completeness, or lock
checks.

The controller activates a named `pg_cron` compaction job for the next exact UTC
minute. After the run, reconciliation inspects the job history and current
relation sizes, deactivates the job, and classifies the result. A skipped or
ineffective run is retried after 15, then 30, then 60 minutes. Later attempts
remain capped at a 60-minute interval so a persistent problem cannot create a
tight I/O loop.

### Lowest-I/O compaction first

Production evidence shows that the reclaimable space is concentrated in the
deal TOAST relation, while the live main heap and indexes are much smaller.
Therefore the first compaction command targets only the corresponding TOAST
relation through the parent table:

```sql
VACUUM (
  FULL,
  PROCESS_MAIN FALSE,
  PROCESS_TOAST TRUE
) public.deals;
```

PostgreSQL 17 explicitly supports `PROCESS_MAIN FALSE` when only a relation's
TOAST storage needs vacuuming. This avoids rewriting the approximately 66 MB
main heap and rebuilding approximately 74 MB of indexes, minimizes temporary
headroom and WAL generation, and directly targets the approximately 370 MB
legacy allocation. It still reads and rewrites the TOAST relation and therefore
remains a quiet-period operation.

PostgreSQL ignores `SKIP_LOCKED` for `VACUUM FULL`. While the one-shot job is
armed, the controller therefore applies a five-second `lock_timeout` only to the
cron role in this database; app roles remain unchanged. The job fails quickly
and enters bounded retry backoff if it cannot obtain its exclusive lock. The
controller resets the role setting after a verified terminal run and keeps it
in place while job termination is uncertain. Reconciliation verifies the
post-run size rather than treating cron exit status alone as proof of recovery.

A full main-table rewrite is not a routine fallback. If TOAST-only compaction
finishes but the database remains above the safety threshold, the controller
keeps imports fail-closed and reports that the remaining relation mix has no
safe automatic Nano-sized rewrite. This prevents an unbounded full-table rewrite
from consuming the last physical disk headroom. R2-first writes make this state
unlikely after the current legacy TOAST allocation is reclaimed.

## Import admission and stopping behavior

A service-role-only admission RPC atomically locks the archive, compaction, and
import singleton rows, then returns one decision from indexed or constant-time
checks: `allowed`, `archiving`, `capacity_guard`, `compacting`, or
`status_unavailable`. An allowed response includes a five-minute import lease,
which exceeds the hosted function's worst-case wall time with margin; the
handler releases the exact token in `finally`, with expiry as crash safety.
Archive and compaction acquisition use the same row-lock order, so no two kinds
of storage-heavy work can cross the admission check concurrently.

`hubspot-ingest` calls it before token exchange, HubSpot requests, or database
writes. Any unavailable/error result fails closed with HTTP 503 and a retryable
message. A 30-second in-flight import invocation is allowed to finish its current
bounded operation; the existing browser stop request prevents the next slice.
The ten-minute archive-to-compaction cooldown is substantially longer than that
maximum invocation budget.

The frontend uses the same policy. Storage status polls every five minutes in
normal capacity, every minute from 75% upward, and every minute while recovery
is active. Dashboard and Company Detail disable their import actions immediately
when the shared recovery decision locks.

Imports unlock only when all of these are verified:

- database usage is below 82%;
- no archive candidates remain;
- no compaction is scheduled, running, or waiting for verification;
- storage status is available.

## User-visible recovery status

The storage panel and recovery warning distinguish:

- proactive archive maintenance;
- capacity guard active;
- archive cooldown before compaction;
- compaction scheduled or running;
- busy-database skip with next retry time;
- automatic recovery complete;
- fail-closed external or headroom condition.

The status copy must not instruct the user to run manual compaction while the
automatic controller is healthy. It shows a manual action only for an explicit
`failed_closed` state that automatic retries cannot safely resolve.

## Failure behavior

- R2 upload or verification failure: retain Postgres data, record the error, and
  retry later without advancing archive state.
- Archive lease held: perform no second batch.
- Capacity or admission check unavailable: reject imports and perform no writes.
- Database busy at compaction time: the cron-role `lock_timeout` fails within
  five seconds; reconcile and retry with backoff.
- Cron job failure or interruption: retain the original PostgreSQL relation;
  verify sizes and retry only after the backoff and quiet checks.
- TOAST compaction succeeds but storage remains high: keep imports blocked and
  enter `failed_closed`; do not escalate automatically to a higher-I/O rewrite.
- Supabase or R2 outage: keep the last safe state, reject imports, and resume
  reconciliation after the provider recovers.

## Security

All new tables use RLS and revoke browser access. Controller functions live in a
non-exposed schema when possible and use a fixed `search_path`. Public wrappers,
if needed by Edge Functions, are executable only by `service_role`. No R2,
database-password, or cron credential is exposed to the browser.

The controller never accepts a table name or SQL command from a request. The
compaction command is a fixed migration-defined string for `public.deals`.

## Verification

Automated tests cover:

- threshold boundaries and global batch budgets;
- one-owner round-robin archive selection;
- zero-work history coalescing;
- browser and server-side import admission;
- two-observation archive completion and ten-minute cooldown;
- quiet-window and 95% emergency behavior;
- advisory-lock and active-work skip conditions;
- one-shot cron scheduling, deactivation, and 15/30/60-minute backoff;
- TOAST-only `VACUUM FULL` command shape and prohibition of an automatic main
  heap rewrite;
- service-role-only privileges, RLS, and fixed search paths;
- recovery status states and adaptive polling.

Full verification includes all tests, typecheck, lint, build, migration security
checks, GitNexus change detection, remote migration/function inventory, cron job
state, and authenticated browser behavior.

For production recovery, verify before and after database, WAL, main heap, index,
and TOAST sizes; zero archive candidates; absence of active writers; cron result;
R2 pointer integrity; representative authenticated archive read-through; CRM row
counts; and final import admission. Production is not considered recovered until
the live database is below 410 MB or the controller reports an evidence-backed
fail-closed limitation.

## Deployment and rollback

The existing GitHub deployment workflow applies the migration and Edge Function
changes once. Runtime maintenance thereafter is Supabase-native and does not use
a scheduled GitHub Action.

Deployment initially creates the compaction job inactive, installs the controller
state, then enables reconciliation. Because production is already above 95% with
zero archive candidates, the first quiet eligible tick enters emergency recovery
automatically.

Rollback deactivates the compaction and reconciliation jobs and restores the
previous archive policy. It does not delete R2 objects, archive pointers, CRM
rows, or recovery history. Import admission remains fail-closed if rollback
leaves storage above the safe threshold.

## Success criteria

- Normal HubSpot synchronization remains R2-first and does not recreate raw JSON
  bloat in Postgres.
- Archive work begins early, is globally bounded, and never multiplies by owner.
- Imports are stopped before the 500 MB quota and cannot bypass the guard through
  a stale client.
- Archive and compaction do not overlap.
- Current legacy TOAST allocation is reclaimed through the lowest-I/O supported
  operation.
- Busy or failed maintenance retries automatically without a resource spike or
  tight loop.
- Imports resume automatically only after live capacity is verified safe.
- Routine operation requires no scheduled GitHub Action, manual SQL, or manual
  compaction button.
