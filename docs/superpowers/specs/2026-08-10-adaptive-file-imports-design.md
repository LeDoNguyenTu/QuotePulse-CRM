# Adaptive Uploaded-File Imports Design

## Goal

Allow each user to upload and retain spreadsheet data in a separate workspace, review automatic CRM match suggestions, and explicitly choose if and how that file updates CRM data. Keep this workflow isolated from the HubSpot API sync.

## Scope

- Replace durable HubSpot attachment navigation with a browser-facing file-preview URL when a HubSpot file ID is known.
- Add a saved uploaded-file workspace with an upload list and a per-file data view.
- Accept `.xlsx`, `.xlsm`, and `.csv` files; retain each file's original name and dynamically detected header schema.
- Store source row values as JSON so every upload can have different columns.
- Suggest existing CRM matches in this order: normalized email, normalized company name, then normalized contact name plus company name.
- Identify the selected CRM match, explain its match reason, and link it to the exact CRM record view.
- Require a merge configuration and confirmation before creating or updating any CRM records.
- Let the user choose, per merge, whether Companies, Contacts, and Deals may be updated and/or created.
- Allow deletion only before a successful merge; display merged files as protected and disable deletion.
- Add an explicit export scope: whole CRM database or only rows whose last HubSpot deal activity is within an inclusive user-selected date range.

## Out of Scope

- Re-running HubSpot sync from uploaded files.
- Sending email directly from uploaded rows before those rows are explicitly merged.
- Storing HubSpot private-file download URLs, which expire quickly.
- Auto-merging or silently changing CRM records.

## Existing Context

The primary workbook sample, `PDMC_Refactored_CRM_Prospects_Updated.xlsm`, has a sheet named `Table1_1` with 22 headers, including `Email Address`, `Company name`, `First Name`, `Last Name`, `Last Called Date`, and several sales-outreach fields. Those headers are representative only; the feature cannot assume they exist in future uploads.

The application currently has a HubSpot-driven CRM dashboard, configurable HubSpot object tables, a `company_dashboard` view, `attachments`, and a `parse-quote` function. Private HubSpot file downloads are correctly minted only on demand and must remain separate from durable browser navigation links.

## User Experience

### Uploaded files index

Add an `Uploaded files` navigation item separate from `Dashboard` / HubSpot CRM. It lists the signed-in user's uploads with file name, uploaded timestamp, sheet selected, row count, merge status, and actions.

Actions:

- `Open` opens the independent table view.
- `Delete` asks for confirmation and is available only while the file has not been successfully merged.
- Merged files show `Merged` and a disabled delete control with an explanation that their data is now represented in CRM tables.

### Upload and mapping

The user chooses a workbook and, if applicable, a sheet. The app detects headers and a small preview without assuming a schema. A mapping step lets the user choose any detected source column for these optional semantic roles:

- email
- company name
- first name
- last name
- full contact name
- deal name
- deal stage
- last activity date

The mapping is saved with the file and is editable before its first successful merge. It is never inferred as a fixed system-level file format.

### File table and matching

The file view renders the original source columns as a paginated table. It adds product-owned columns only: `CRM match`, `Match reason`, and `Merge result`.

Match suggestions run asynchronously after upload/mapping change:

1. exact normalized email against owned contacts;
2. exact normalized company name against owned companies;
3. exact normalized contact name plus exact normalized company name.

Each row reports `Matched`, `Unmatched`, or `Needs review`. A matched row links to the exact internal CRM target: `/company/:id` for company-backed rows and the appropriate existing object view when a direct company link is unavailable. No row may cross tenants.

### Merge wizard

`Merge into CRM` opens a confirmation flow. It shows row counts by match status and a concise summary of the requested changes before any write.

The user selects independent policies for Companies, Contacts, and Deals:

- do not merge this record type;
- update matched records only;
- create unmatched records only;
- update matched records and create unmatched records.

The confirmation must state that only the selected record types and policy will be applied. On success, save a merge run with its selected policy, totals, and per-row results. A successful merge locks the source file against deletion. A failed or partially failed merge retains the file, logs its errors, and remains reviewable; it does not become deletion-protected until at least one merge write has completed successfully.

### HubSpot file links

For imported attachments with a HubSpot file ID, the UI presents a `Open in HubSpot` link using:

`https://{uiDomain}/file-preview/{portalId}/file/{hubspotFileId}/`

The portal ID and UI domain are loaded from authenticated HubSpot account metadata during sync and stored in the current user's private settings. The link falls back to `app.hubspot.com` only when HubSpot does not provide a UI domain. If account metadata is unavailable, the UI leaves the link absent and continues to show on-demand parsing behavior. It never treats this browser link as a server-download URL.

### Export

The current export control receives a scope chooser:

- `Entire CRM database` (default): no last-activity restriction.
- `HubSpot last activity date range`: requires both a start and end date and exports only records with `last_deal_at` in that inclusive UTC calendar-date interval.

The selected range and resulting export should make no claims about activity dates for uploaded-file-only data; it is a HubSpot deal-activity export.

## Data Model and Security

Use dedicated, owner-scoped tables rather than adding arbitrary columns to CRM entities:

- `uploaded_files`: file metadata, original name, selected sheet, detected headers, mapping JSON, status, row count, and owner ID.
- `uploaded_file_rows`: row number, source values JSON, derived matching values, candidate CRM target, match status/reason, and per-row merge result.
- `uploaded_file_merges`: immutable merge configuration, confirmation time, completion state, totals, and error summary.

All tables carry `owner_id`, have RLS policy `owner_id = auth.uid()`, and use `with check` for writes. Every Edge Function query uses an explicit `.eq('owner_id', userId)` filter because it executes with the service role.

The browser should upload only its parsed structured data after client-side workbook parsing, with server-side limits for file size, row count, header count, and row value size. Do not store or execute workbook macros from `.xlsm` files; read their worksheets as data only.

The merge function uses a per-file, owner-scoped transaction-like sequence and records idempotency per source row to prevent repeated confirmation from duplicating writes. It must deduplicate contacts and attachments using select-then-insert plus a `23505` guard, never `onConflict` against the application's partial or functional indexes.

## Components and Boundaries

- A workbook parser module only reads files, selects sheets, derives headers, validates limits, and returns row JSON.
- A matching module only normalizes values and produces deterministic candidate/match-reason results; it has no React or database dependencies.
- Upload hooks own Supabase reads and mutations plus query invalidation.
- `UploadedFiles` owns index, upload, and file-detail routing; reusable table components render dynamic columns.
- A merge Edge Function owns privileged CRM writes and status persistence.
- Existing HubSpot dashboard, ingest flow, and HubSpot object tables remain separate consumers.

## Error Handling

- Invalid/empty workbook, unsupported format, no headers, duplicate headers, size/row limit breaches, and unreadable selected sheets are shown before saving an upload.
- Ambiguous matches show `Needs review` and are excluded from updates unless the user later chooses a CRM target for that row.
- A merge error names the source row and operation. It does not report `ok: true` for an all-failure run.
- Missing portal ID leaves the attachment link unavailable with a helpful explanation; OCR parsing still uses its existing authenticated download path.
- The merge confirmation page warns the user about overwriting values whenever an `update` policy is selected.

## Testing and Verification

- Unit test header normalization, duplicate-header handling, row type preservation, mapping validation, and matching priority.
- Component test dynamic columns, match-state labels, link targets, policy selection, confirmation gating, and merged-file delete disabling.
- Edge Function tests prove owner filters, merge policy behavior, idempotency, no cross-user data access, error persistence, and no `ok: true` for total failure.
- Test durable HubSpot preview URL construction separately from download URL resolution.
- Test export whole-database and inclusive activity-range behavior, including invalid partial date ranges.
- Run `npm run build && npm run typecheck`, focused Vitest/Deno tests, and a manual browser flow: upload sample `.xlsm`, select mappings, inspect matches, run a confirmed merge, verify deletion locks, open a HubSpot file-preview link, and export both scopes.

## Rollout

Add the migration and Edge Function source to the repository. Production database/function availability depends on the existing GitHub Supabase workflow; verify the remote migration history and deployed function before relying on the user interface in production.
