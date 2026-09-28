# Phase E activities handoff

## Scope

- One workspace-scoped activity model for notes and calls.
- Chronological company, contact, and deal timelines.
- Manual note/call composer; deal calls can atomically update `last_call_at`.
- Workbook mappings for activity date, Call Log, Remarks, and Comments.
- Imported activity provenance retains the physical worksheet row and mapped source header.

## Test data observations

- `Leads Database - testing.xlsx`: 281,664 bytes, one worksheet, 13 data rows, 17 columns.
- The importer suggests mappings for `Last Contact Date`, `Follow-up Date`, `Call Log`, `Company Name`, `Name`, `Remarks`, and `Comment`.
- Both Excel 1900 and 1904 date systems are supported. Blank worksheet rows do not corrupt lineage.
- `Mymailboxbackup_20260917.pst`: 42,427,392 bytes. It remains Phase H input; do not store the raw PST, bodies, or attachments in Supabase.

## Storage boundary

Supabase remains the active relational/query database for workspace-safe activity metadata. R2 remains cold object storage for large immutable artifacts. PST extraction should run client-side or in an isolated bounded worker and persist only normalized searchable metadata; raw mailbox content is not promoted to primary database memory.

## Verification

- `npm test -- --run`: 77 files, 327 tests.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed with the existing bundle-size warning.
- Supabase CLI is not installed locally; migration execution must be proven by the main-branch deployment workflow.
