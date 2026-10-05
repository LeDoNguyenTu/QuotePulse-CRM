# Customer-status import reconciliation handoff

Date: 2026-10-06

Branch: `feat/customer-status-reconciliation`

Pull request: `https://github.com/LeDoNguyenTu/QuotePulse-CRM/pull/30`

Implementation commit: `eebc393d02a9e9e89111ba3673746689ec90719e`

Base: `main` at `6ba5be2ace88806a6e8e97126dbdccf90e79eb14`

## Delivered behavior

- `Support customers.xlsx` maps the `Name` column to company name without asking the user to override the generic contact-name interpretation.
- The `Active customers` worksheet infers `Maintenance Customer`; `Inactive Customers` infers `Former Customer`.
- A name found in both active and inactive worksheets is not assigned an inferred status. It is imported with a persistent `Review required` flag and reason.
- Repeated names with differing row details inside one support worksheet are also flagged. Byte-for-byte-equivalent duplicate rows are retained in the preserved source artifact but are not treated as a status conflict.
- Manual company-field choices win over every later workbook import. The importer strips all incoming company provenance before the base merge, then reapplies each field's source only when the existing source is not `user`; this protects name, industry, website, domain, phone, address, and customer status across repeated uploads.
- The company editor includes an explicit `Customer status reviewed` acknowledgement. Changing the status or checking that acknowledgement clears the review flag and records the selected status as a user decision; unrelated company edits do not clear review.
- Company-only row fingerprints are based on normalized company identity rather than row number, so reordered reuploads update the prior CRM company instead of creating row-position duplicates.
- Every revision records its original verified workbook pointer transactionally as `pending`, then moves exactly once to `ready` after its complete source-row index is stored. Ready artifacts are immutable, concurrent finalizers are idempotent, and an older revision cannot replace the current import metadata. Export reads the exact ready artifact for the selected latest revision.
- Contact lifecycle and row actions now render as compact bordered buttons, with a distinct destructive treatment for Delete.

## Real workbook evidence

Read-only inspection of:

`C:\Users\ADMIN\OneDrive - Murdoch University\Ca-Meo Backup\Desktop\Customer files\Support customers.xlsx`

- `Active customers`: 111 populated rows; one differing same-name duplicate group.
- `Inactive Customers`: 248 data rows, 245 populated names; three differing same-name duplicate groups.
- Two normalized names occur in both worksheets; those companies are flagged for review rather than automatically assigned a conflicting status.

No customer names or workbook contents were copied into the repository.

## Verification evidence

- `npm test -- --run`: 147 files, 542 tests passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run build`: passed (existing large-chunk advisory only).
- Rendered browser check at a 322 px-wide action-cell layout: Verify, Mark outdated, Hide, Edit, and Delete all render as visible buttons without clipping.
- Vercel CLI: installed and authenticated as `ledonguyentu`; version `62.2.0`.
- Independent read-only code review: no remaining Critical or Important findings after repeated-upload provenance and cross-member concurrency fixes.

## Deployment boundary

The migration and Edge Function changes are committed source only until this branch is merged and the Supabase workflow succeeds. Local SQL runtime lint could not be executed because no local Supabase Postgres/Docker runtime is available on this machine. Pending-to-ready finalization and cross-member concurrency therefore still require a live Supabase/R2 smoke test. Do not describe the database migration or Edge Functions as deployed until the post-merge workflow is green.

## Post-merge checks

1. Confirm the GitHub Supabase workflow succeeds for the exact merge SHA.
2. Confirm the Vercel deployment for that SHA is Ready.
3. Import both worksheets of a disposable copy of `Support customers.xlsx` in a test workspace.
4. Verify unambiguous rows receive the worksheet-derived statuses and cross-tab/differing duplicates show `Review required`.
5. Reorder rows, change a non-user-owned field, reupload the same filename/sheet, and confirm the existing company updates while a new revision and source artifact are recorded.
6. Manually override one status, reupload again, and confirm the manual value remains and its review flag stays cleared.
7. Export the latest revision and compare the preserved source-only columns and worksheet layout with the uploaded workbook.
