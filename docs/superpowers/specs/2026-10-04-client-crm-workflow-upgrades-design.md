# Client CRM Workflow Upgrades Design

Date: 2026-10-04
Status: Approved direction, pending written-spec review

## Purpose

Bring the Sales CRM in line with the customer's actual workbooks and daily workflow without replacing the existing workspace, source-provenance, workbook round-trip, queue, or tenancy architecture.

The result must let users maintain customer and contact lifecycle state, update call history and pipeline fields, receive task reminders, export chosen rows and columns, upload and send rich HTML email, and safely re-upload updated workbooks without duplicating the CRM.

## Design principles

- Keep the existing workspace names and tenant boundaries.
- Prefer additive fields and focused RPC changes over a new generic custom-field system.
- Preserve imported source lineage and original-workbook round-tripping.
- Never silently hide a contact merely because a duplicate is suspected.
- Derive summary fields from canonical activities and tasks where practical.
- Keep Deal Stage, Call Outcome, and Appointment Status independent.
- Keep plain-text email working while adding sanitized HTML.
- Make migrations backward compatible with existing records and imports.

## Scope and delivery slices

### 1. Neutral workspace identity and UI cleanup

- Replace Innocom and R Systems artwork in the workspace chooser and compact application header with neutral database glyphs.
- Use a distinct color for each workspace kind while retaining the database workspace name exactly as stored.
- Remove company-name/logo labels that imply third-party branding.
- Correct the Contacts and Deals column-picker positioning, overflow, layering, and narrow-screen behavior. The Deals fix is required while the Deals tab remains part of the product.

### 2. CRM lifecycle fields

Add queryable fields to the existing relational records:

- Companies:
  - `customer_status text` with standard UI choices: Current Customer, Prospect, Former Customer, Maintenance Customer.
  - Arbitrary custom text is allowed through a Custom option.
- Contacts:
  - `record_state text not null default 'unverified'`, constrained to `unverified`, `verified`, or `outdated`.
  - `is_hidden boolean not null default false`.
  - `duplicate_review_of uuid null`, workspace-safe self-reference to the newer suspected duplicate.
- Deals:
  - `call_outcome text null`.
  - `appointment_status text null`.
- Activities:
  - `call_outcome text null` for call activities.
  - `updated_by` and `updated_at` audit fields so an activity can be edited without losing its original creator or creation time.

All new fields remain workspace scoped under the existing RLS model. New functions use `security invoker` unless privileged behavior is strictly required. Any service-role read or write must filter `workspace_id` and the authenticated owner/member scope explicitly.

## Contact duplicate behavior

The import path normalizes a candidate contact's name and phone. Email remains the strongest match when present. A name-and-phone match is treated as a duplicate candidate when both normalized values are non-empty.

When a newly imported row matches an older contact:

1. Reuse/update the same contact when source identity proves it is the same workbook row or the email match is unambiguous.
2. Otherwise create or retain the newer contact, mark the older contact `outdated`, and set its `duplicate_review_of` link.
3. Do not set `is_hidden` automatically.
4. Show a Duplicate review indicator and allow the user to compare records.
5. Provide individual Hide/Show controls and a workspace action to hide all currently outdated contacts.

Hidden contacts are excluded by default from contact lists and campaign audiences, with an explicit filter to show hidden records. Outdated contacts remain visible until hidden. Verified contacts cannot be automatically downgraded solely by a fuzzy import match; they are flagged for review instead.

## Idempotent workbook re-upload

Re-uploading an edited version of a previously imported workbook must update source-linked records rather than reproduce every row.

The import source gains a stable workbook identity derived from normalized filename plus selected worksheet and stored source metadata. Each imported row gains a stable row fingerprint built from the strongest available business identifiers:

1. explicit source/customer/account code when mapped;
2. normalized company plus contact email;
3. normalized company plus contact name and phone;
4. normalized company plus deal name;
5. source row number only as a final compatibility fallback.

On re-upload:

- Match the existing source by workspace and workbook identity.
- Match rows by stable row fingerprint before falling back to existing entity dedupe.
- Update source references and mapped CRM values in place when a row changed.
- Insert only genuinely new rows.
- Retain records missing from the newer file; do not delete or hide them automatically.
- Reconcile imported activities by source row and source column so unchanged notes/call logs are not duplicated.
- Return created, updated, unchanged, duplicate-review, and warning counts in the import receipt.
- Preserve a new source revision record so the user can audit when the workbook was refreshed and export through the current source layout.

This design supports edited workbooks even when row numbers move, provided at least one stable business identifier remains.

## Short database IDs

New import display IDs use a short, case-insensitive format such as `DB-A7K9Q2` rather than the current 12-character `CRM-...` suffix. The database UUID remains the authoritative internal key.

- Existing IDs remain valid and visible; no destructive rewrite is required.
- The new six-character base32-style suffix excludes ambiguous characters where practical.
- Uniqueness remains `(workspace_id, database_id)` and generation retries on collision.
- Search and source filters accept both legacy and new formats.

## Activities and company summaries

- Activity cards gain Edit for notes and calls.
- Editing validates the same body/date/outcome rules as creation and updates audit fields.
- A call activity can store Call Outcome and optionally update its linked deal's latest `call_outcome` and `last_call_at`.
- Company list/detail views expose derived values:
  - Last Contact Date: newest call/note occurrence.
  - Follow-up Date: earliest due date among open/in-progress related tasks, falling back to the nearest related deal follow-up.
  - Last Call Outcome: outcome on the newest related call.
  - Latest Activity: newest activity timestamp and bounded preview.
  - Call Log remains the activity timeline rather than a second mutable text field.

List RPCs calculate these summaries with indexed lateral/aggregate lookups and continue returning paginated counts.

## Contact search and visibility

- Contact search checks full name, email, phone, job title/designation, and company name.
- Add State and Visibility filters.
- Add State, Visibility, and Duplicate Review columns to the column picker.
- Import aliases include `Designation`, `Resigned`, and equivalent workbook headings.
- `Resigned = Yes` maps to `outdated`; it does not automatically hide the contact.

## Deals and pipeline mapping

- Preserve the Deals entity and existing `stage` field.
- Add independently selectable columns for Call Outcome and Appointment Status.
- Map NAV workbook `Last Call Outcome` to `call_outcome`.
- Map telemarketing `Appointment Status` to `appointment_status`.
- Continue mapping source `Deal Stage` to `stage`; do not infer appointment status from call outcome or vice versa.
- Add the relevant NAV and telemarketing columns to import auto-detection and source-preserving export.

## Company customer status

- Import `Customer Status` from support-customer workbooks.
- When the source sheet is `Active customers` and status is blank, suggest Current Customer; when it is `Inactive Customers` and blank, suggest Former Customer. The preview must show the suggestion before commit.
- Preserve explicit workbook values such as Former Maintenance Customer as custom statuses.
- Manual changes override later inferred defaults. A later workbook with an explicit status may update an earlier workbook-derived value, but it must not overwrite a user-authored value without confirmation.

## Row and column exports

Companies, Contacts, and Deals receive:

- a checkbox on each row;
- Select page;
- Select all matching the active filters;
- Clear selection;
- Export selected rows or all matching rows;
- an export dialog listing the entity's available columns, initialized from the current visible-column selection.

The export endpoint accepts only allowlisted entity, filter, sort, row-ID, and column keys. It rechecks workspace membership and queries only the requested workspace. It produces an `.xlsx` file with typed dates/numbers and spreadsheet-formula neutralization for text values. Source-preserving workbook export remains a separate action because it has a different contract.

## Task reminder popup

- Keep the existing `pg_cron` materialization and `crm_notifications` records.
- Add a workspace-level notification hook that polls unread reminders at a modest interval and refreshes on window focus.
- Newly observed reminders open a non-blocking popup with task title, due time, Open task, Mark read, and Dismiss actions.
- A persistent notification button shows the unread count and reopens the reminder list.
- Completing/cancelling/reassigning a task keeps using the existing reconciliation trigger.
- This is an in-app notification; browser push permissions and service workers are outside scope.

## Rich email templates

Templates and campaigns gain `body_format` (`plain` or `html`). Existing rows default to `plain`.

The editor supports:

- plain-text editing;
- sanitized HTML source editing and preview;
- uploading `.html` or `.htm`;
- optionally uploading the associated image ZIP used by Outlook-exported HTML;
- replacing local image references with stable hosted HTTPS URLs;
- the existing personalization placeholders in text nodes and safe attributes.

Only non-sensitive email artwork is accepted. Assets are validated by type and size, uploaded directly from the browser to a dedicated public Supabase Storage bucket under owner/workspace/template content-hash paths, and exposed through stable URLs suitable for email clients. Public delivery is intentional because external email clients must fetch these assets; the bucket accepts only bounded email-image MIME types and never customer workbooks or CRM attachments. HTML is sanitized through a strict allowlist that preserves email tables and inline styles but removes scripts, forms, event handlers, remote tracking code, and unsafe URLs.

The queue stores the format with the rendered body. Unsubscribe content is inserted as HTML when the format is HTML and as text otherwise. Microsoft Graph sends HTML MIME; Brevo uses `htmlContent`. Plain templates retain the current text path. A plain-text fallback is generated for audit/readability.

## Password change diagnosis

The repository already re-authenticates with the current password before calling Supabase `updateUser`. Implementation begins by reproducing the failure in both legacy and Sales settings routes against the same auth client behavior.

- Add UI-level regression coverage for successful change, wrong current password, mismatched confirmation, missing email, and provider error display.
- Verify the deployed Supabase Auth configuration and current production bundle before changing the helper.
- Do not weaken reauthentication or expose credentials in logs.

## Error handling

- Imports fail visibly when the commit or revision update fails; partial success must not be reported as complete.
- Bulk actions report affected and skipped counts.
- Export rejects unknown columns, excessive selections, cross-workspace IDs, and unsupported filters.
- Rich-email upload reports unsafe/unsupported elements and missing image assets before save.
- Provider failures retain the existing retry/ambiguous-delivery rules.
- UI mutations invalidate affected list, detail, task, notification, and campaign queries.

## Verification

Each slice requires focused regression tests plus the repository-wide gates:

```bash
npm test -- --run
npm run typecheck
npm run lint
npm run build
```

Database work also requires migration tests, tenant-isolation tests, function/RPC grants review, and local Supabase tests when the environment supports them. Import verification uses edited copies of the supplied customer workbooks to prove created/updated/unchanged counts and absence of duplicated activities. Email verification uses the supplied Outlook HTML and image ZIP with rendered desktop/mobile inspection and provider payload tests. UI work requires rendered browser inspection of the workspace chooser, column pickers, contact states, export dialog, reminder popup, and rich-email preview.

Deployment, migration application, provider acceptance, and production password behavior are not considered verified until observed directly in their respective live systems.

## Out of scope

- Replacing the CRM with workbook-specific tables.
- Automatically deleting records missing from a refreshed workbook.
- Automatically hiding suspected duplicates.
- Browser/OS push notifications.
- A full drag-and-drop email design platform.
- Changing existing workspace names.
