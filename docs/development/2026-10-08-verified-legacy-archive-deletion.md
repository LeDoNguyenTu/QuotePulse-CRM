# Verified legacy archive deletion

## Purpose

The legacy workspace archive previously stopped at a deletion dry run. This change adds an
owner-only, resumable deletion workflow that removes the archived live rows from Supabase only
after every R2 object has been fetched and checksum-verified again.

## Safety model

1. The archive must be `verified`; its manifest identity, SHA-256, object list, row counts, and
   owner/workspace IDs must reconcile.
2. The current `legacy_data_versions.version` must still equal the archive's captured
   `source_version`. Any intervening allow-listed write blocks deletion.
3. Verification processes 25 R2 objects per Edge Function call and resumes from
   `deletion_verified_at`.
4. Deletion unlocks only after all objects are verified and the user types the exact phrase
   `DELETE <verified row count>`.
5. Each delete call invokes a service-role-only RPC and removes at most 5,000 rows from one
   table. Tables are processed in reverse restore order so foreign-key dependants are removed
   before their parents.
6. The archive row is locked for each short transaction. A 30-second statement timeout and
   deterministic row order bound lock exposure. Closing the page is safe; the next run resumes
   from per-table deletion counts.
7. A legacy email send or template that is still referenced by an excluded unsubscribe/security
   record or the Sales CRM is retained. Its referenced legacy contact, company, and template are
   retained too, so the workflow never cascades into, nulls, or mutates those relationships or
   external records.
8. The archive is marked `deleted` only when deleted plus explicitly retained rows exactly match
   the verified manifest. R2 objects and manifest remain available for restore.

Authentication records, `user_settings`, provider keys/tokens, refresh tokens, unsubscribe token
hashes, and the Sales CRM workspace are outside the allow-list and are never touched.

## Storage reclamation

Deleting rows makes their pages reusable but does not necessarily reduce `pg_database_size`.
After deletion reaches `deleted`, run `VACUUM (FULL, ANALYZE)` outside a transaction and one table
at a time, starting with `contacts`, `deals`, `companies`, and
`company_attachment_archives`. Check free disk headroom and active writers first. Re-read
`pg_database_size(current_database())` after every rewrite; stop once the Supabase storage target
is reached. Do not run several `VACUUM FULL` operations concurrently.

## Production audit before release

At 2026-10-08 (Asia/Singapore), the current legacy archive was:

- Archive ID: `84c1b5f4-66b4-4213-a528-beaec8f52e62`
- Status: `verified`
- Source version: `506`; current source version: `506`
- Rows: `512,824`; R2 objects: `2,059`
- Deletion-verified objects: `2`
- Database size from Postgres: `380 MB`
- Required typed phrase for this archive: `DELETE 512824`

The live dependency audit found six archived `email_sends` referenced by excluded
`email_unsubscribe_tokens`; those six rows will be retained. No production delete was performed
while creating this change.

## Verification commands

```powershell
npm test -- --run
npm run typecheck
npm run lint
npm run build
```

The migration test checks service-role-only execution, version/object guards, reverse dependency
order, bounded batches, trigger scoping, statement timeout, and final row-count reconciliation.

## Read-only access after deletion

The dashboard now separates the live database from the verified R2 archive. Archived Companies,
Deals, and Contacts are read through the authenticated `workspace-archive` function. Each request
reads at most two checksum-verified objects, uses an HMAC-authenticated continuation cursor, and
returns only table-specific display fields. R2 keys and ownership columns never reach the browser.

Archived rows stay read-only. Choosing **Edit** explains that the row must be restored, and the
user may cancel or selectively restore it. Selective restore re-verifies the object, restores a
required parent company first, refuses cross-owner or divergent live rows, and leaves every R2
object unchanged. The service-role-only transaction returns `restored`, `already_restored`, or
`conflict` and never overwrites a live row.
