# R2 Cold Archive Design

## Goal

Keep QuotePulse's visible CRM behaviour and normal working set in Supabase while
moving bulky, rarely queried HubSpot replicas to a private Cloudflare R2 bucket.
The migration must never delete a Postgres payload until its R2 copy is verified.

## Scope

Archive two sources of database growth:

1. `deals.hubspot_properties`, the complete raw HubSpot property snapshot.
2. Generic note-file metadata in `attachments`. Quote attachments remain in
   Supabase because the company dashboard, quote filter, and OCR flow require
   immediate relational access.

Companies, deals' canonical fields, contacts, quote attachments, KYC, email,
Auth, RLS, and all existing frontend routes remain in Supabase.

## Architecture

R2 is a private object store accessed only by authenticated Supabase Edge
Functions using server-only R2 credentials. The browser continues to use the
same QuotePulse UI and Supabase session; it receives archive-backed data through
an authenticated Edge Function rather than R2 credentials or public object URLs.

Each deal snapshot is stored as a compressed, immutable R2 object under an
owner-scoped key. A small pointer and checksum on the deal identify the verified
object. Each company's generic attachment metadata is stored as one compressed,
owner-scoped R2 object, so opening a company needs at most one archive read.
The existing Attachment List remains visually unchanged and combines the
Supabase quote records with its archived generic records on the server.

## Write and migration flow

1. On a new or changed HubSpot deal, write the raw property snapshot to R2 with
   bounded concurrency.
2. Verify the object checksum and size.
3. In a Postgres transaction, record the archive pointer/checksum and clear only
   the redundant JSON payload. If R2 fails, retain the Postgres payload and
   report an import warning; no source data is discarded.
4. Migrate existing rows in resumable owner-scoped batches. Normal CRM reads
   continue to use Supabase throughout the migration.
5. For generic attachments, write and verify the per-company archive, then
   delete only that company's generic attachment rows. Preserve all `quote`
   rows.

## Behaviour and performance

The frontend layout, routes, sign-in, filters, company detail, and import
controls do not change. Property/archive requests are authenticated by the
existing Supabase user session. Standard CRM tables remain hot in Supabase;
archive access is only added when full raw properties or generic attachment
metadata is needed.

R2 writes run with a small bounded concurrency limit. The initial backfill is a
resumable maintenance operation, separate from normal user interaction. The
implementation will measure import slices before enabling the cutover and will
retain the Postgres copy on any failed R2 upload.

## Security and configuration

Store these values only as Supabase Edge Function secrets:

- `R2_ACCOUNT_ID`
- `R2_BUCKET`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

Use an R2 token restricted to this one bucket. Keys contain `owner_id` and are
validated server-side before reads or writes. No R2 key, bucket URL, or archive
object is exposed to the browser.

## Success criteria

- Existing user-facing CRM workflows remain available without a UI change.
- Quote/OCR behaviour remains relational and unchanged.
- Every migrated item has a verified R2 checksum before its redundant Postgres
  payload is removed.
- The live Postgres database drops well below the 500 MB free-tier threshold.
- A failed or missing R2 configuration cannot silently delete Supabase data.
