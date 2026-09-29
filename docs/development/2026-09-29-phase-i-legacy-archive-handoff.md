# Phase I legacy workspace archive handoff

## Safety boundary

- Archive input is an explicit 14-table allow-list scoped to the authenticated current legacy workspace owner.
- `auth.users`, `user_settings`, unsubscribe token hashes, and storage-control tables are explicitly excluded.
- Service-role reads always filter the table-specific `owner_id` or `created_by` column.
- The workflow contains no row-deletion operation. The deletion action is a dry run that only marks a fully reconciled archive `deletion_eligible` and returns `deleted: false`.

## Archive and restore

- Each invocation leases one table step, archives at most 250 rows with mutation-safe high-water keyset pagination, reads the compressed content-addressed object back from R2, verifies SHA-256, and stores durable table/object progress for retry.
- Every allow-listed source mutation increments an owner version. Finalization locks and compares that version, so a mixed snapshot can never become verified.
- Object keys are contained beneath `owners/{owner}/workspaces/{workspace}/archives/{archive}`.
- Finalization reconciles object row counts to table counts and writes a versioned, checksum-addressed, read-back-verified manifest.
- Restore reads and verifies one object per invocation, validates archive/workspace/owner/table identity on every row, preflights primary-key owners, and upserts in foreign-key dependency order.
- Email bodies are retained with unsubscribe bearer tokens redacted; token hashes and credential-bearing tables are excluded entirely.
- A final restore count reconciliation is required before `restore_status = verified`.

## Operator flow

The legacy Settings page exposes bounded **Start/Continue archive**, **Restore next verified object**, and **Dry-run deletion check** controls. Interrupted archive and restore operations resume from durable progress. The dry run downloads and verifies one immutable R2 object per invocation, then locks and rechecks the owner mutation version before eligibility can be granted.

## Verification

- Supplied implementation gate: 89 test files / 354 tests.
- `npm run typecheck`, `npm run lint`, and `npm run build` pass.
- `deno check supabase/functions/workspace-archive/index.ts` passes.
- Production migration, Edge Function deployment, R2 object creation, restore, and dry-run deletion remain separate operational evidence gates until deployed and exercised.
