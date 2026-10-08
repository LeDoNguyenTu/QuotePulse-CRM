# R2 archive browser and campaign review design

Date: 2026-10-08 (Asia/Singapore)

## Purpose

Keep the verified legacy CRM archive in Cloudflare R2 while making its companies, deals, and contacts accessible from the dashboard without repopulating Supabase. Archived records remain read-only. An attempt to edit an archived record explains why it cannot be edited and offers a safe, dependency-aware restore.

Make Email Campaigns show and edit the exact message that will be queued. Recipient selection must persist independently of the current industry/search filter and be manageable in a dedicated selected-recipient panel.

## Success criteria

- Users can switch Companies, Deals, and Contacts between Live and Archived data.
- Archived pages are authenticated, owner/workspace scoped, checksum verified, paginated, and read-only.
- R2 remains the source of archived row content; browsing does not restore the entire archive or create a 512,000-row Supabase search copy.
- Attempting to edit an archived row opens a warning with Cancel and Restore record actions.
- A selective restore preserves the archived row ID and provenance, restores required parent dependencies first, and never silently overwrites a conflicting live row.
- Selecting an email template in Email Campaigns immediately displays its subject, HTML, images, text fallback, and recipient-personalized preview.
- Campaign-specific edits do not mutate the reusable template.
- The immutable content queued for each recipient is exactly the content shown by the final review preview, after recipient personalization and unsubscribe-link handling.
- Recipient choices persist when the user changes industry or search filters.
- Choose all matching adds every eligible contact matching the active filter, up to the existing 5,000-recipient campaign limit, not only the currently rendered page.
- A separate Selected recipients panel supports individual removal and Clear all.

## Non-goals

- Editing R2 objects or rewriting a verified archive.
- Restoring the complete legacy archive merely to browse it.
- Building a full 512,000-row relational search index in Supabase.
- Changing reusable templates implicitly from the campaign screen.
- Sending mail immediately from the browser; campaigns continue to use the durable queue and provider cooldowns.

## Archive browsing architecture

### Data source and API

Extend the authenticated `workspace-archive` Edge Function with explicit read actions. The function remains the only component holding R2 credentials.

- `browse`: accepts workspace, archive, allow-listed table, cursor, page size, and an optional bounded search continuation.
- `record`: resolves one archived record from a verified object pointer.
- `restore_record`: restores one selected record and the minimum required parent chain.

Every action must:

1. Resolve the authenticated user.
2. Require current owner membership of the legacy workspace.
3. Load an archive belonging to that workspace and owner with status `verified`, `deletion_eligible`, `deleting`, or `deleted`.
4. Restrict tables to the existing legacy archive allow-list and expose only Companies, Deals, and Contacts to this UI.
5. Validate every R2 key with `assertWorkspaceArchivePointer`.
6. Fetch and decompress the object server-side.
7. Recompute and compare SHA-256 before returning any rows.
8. Validate archive, workspace, owner, table, and sequence identity in the payload.

The browser never receives R2 credentials, raw object keys, or unrestricted archive manifests.

### Pagination and search

`workspace_archive_objects` remains the compact object directory. A cursor contains only opaque, signed/validated paging state representing table sequence and row offset. A normal page reads at most one or two 250-row R2 chunks and returns a maximum of 100 rows.

Archive search is bounded and resumable. Each request scans a small fixed number of verified objects and returns matches plus a continuation cursor. The UI shows search progress and can continue automatically while the archive tab remains open. It must not issue thousands of R2 reads in one Edge Function invocation.

Search covers the useful archived fields for each exposed table, including company/deal/contact names, email, phone, role, product, industry, and HubSpot identifiers where present. Comparisons are case-insensitive. No claim of complete search results is shown until the continuation reaches the end.

### Archived dashboard UI

Companies, Deals, and Contacts receive a Live / Archived segmented control. Archived mode:

- uses its own query keys and does not mix archived rows into live totals;
- shows an Archived badge and archive capture timestamp;
- provides table-appropriate columns using tolerant field access because older archive schema versions may omit fields;
- supports pagination, bounded search, and record details;
- disables all mutation controls except Restore record;
- never presents archived records as current/live CRM state.

### Restore-on-edit

Clicking Edit on an archived record opens a warning:

> This record is archived and read-only. Restore it to the live database before editing.

Actions are Cancel and Restore record. Restore requires a second explicit confirmation naming the record.

The server derives dependencies from the allow-list contract rather than accepting arbitrary client rows. A contact or deal restores its required company first; any other required parent follows restore order. Each archived row is checksum verified again immediately before restoration.

Conflict behavior is fail-closed:

- absent live ID: insert the archived row;
- same live ID and same owner with equivalent content: report already restored;
- same live ID with divergent content: return conflict and require review, with no overwrite;
- ID owned by another user: refuse restoration;
- missing or invalid dependency: refuse restoration and make no partial change.

The restore executes transactionally where database writes are involved and records an audit result. It does not alter the verified R2 archive.

## Campaign composition architecture

### Campaign-local content snapshot

Selecting a reusable template initializes a campaign draft with:

- template ID and template revision timestamp;
- subject;
- sanitized HTML body when available;
- plain-text fallback;
- referenced protected image URLs.

After initialization, these values are campaign-local. Editing them does not update `email_templates`. Changing the selected template warns before replacing unsaved campaign edits.

The campaign queue RPC accepts both HTML and text content and stores them on `crm_email_campaigns` as the immutable campaign snapshot. Recipient queue rows copy that campaign snapshot. The send worker renders personalization variables from the stored snapshot, adds the recipient-specific unsubscribe URL through the existing provider-safe path, and sends the same rendered HTML/text pair for Microsoft Graph or Brevo.

The worker must not re-read mutable template content when sending a queued campaign.

### Editor and preview

The Message content section contains:

- reusable-template selector;
- editable subject;
- HTML-capable editor/import surface consistent with Template Editor;
- editable text fallback;
- Preview tab;
- Source/edit tab;
- recipient selector for previewing personalization.

The preview is sandboxed and uses the same pure rendering function as the queue worker contract. It displays the selected recipient's real name, company, industry, and email substitutions. If no recipient is selected, it clearly labels placeholder values. Broken or unresolved personalization tokens are shown as validation errors before queueing.

Immediately before queueing, a Review campaign step shows provider, audience count, selected preview recipient, rendered subject, HTML preview, text fallback, cooldown, and consent state. Queueing uses the immutable values displayed by this review step.

### Persistent recipient selection

The matching-contact browser and selected-recipient collection are separate concepts.

- Search and industry affect only the matching-contact browser.
- Changing either filter never clears selected recipients.
- Checking a row adds its contact ID to the selected collection; unchecking removes it.
- Choose all matching resolves all eligible IDs for the active filters server-side, up to the 5,000-recipient limit, and unions them with existing selections.
- Duplicate emails are deduplicated according to the existing campaign audience rules.
- Selected recipients are displayed in a dedicated panel independent of the active filter.
- Users can remove recipients one by one or use Clear all.
- The panel shows selected count and enough identity information to distinguish contacts with similar names.
- A preview-recipient control chooses from the selected collection.

Selection is held for the campaign draft and survives filter changes and query refetches. It is cleared only by Clear all, successful campaign queueing, or deliberate navigation/reset confirmation.

## Data contracts and migrations

Add campaign snapshot columns for HTML, text, and format to `crm_email_campaigns` and the corresponding rendered/snapshot fields needed by `email_sends`. Extend `crm_queue_email_campaign` without removing the current signature until all callers are migrated; then remove obsolete overloads in a follow-up migration if required by PostgREST resolution.

Any new privileged archive helper stays in `private`, uses a fixed empty search path, is revoked from `public`, `anon`, and `authenticated`, and is granted only to `service_role`. Browser-visible operations go through the authenticated Edge Function, which explicitly verifies workspace ownership before service-role reads or writes.

No R2 credentials, provider tokens, service-role keys, or archived excluded secrets are returned to the client.

## Failure handling

- R2 read, decompression, checksum, identity, or cursor failures return a non-destructive error and no rows.
- Search continuation can be retried from its last acknowledged cursor.
- Restore conflicts leave Supabase and R2 unchanged and identify the conflicting record.
- Template-load failure keeps existing unsaved campaign content.
- Audience bulk-selection failure keeps existing selections and reports that no new recipients were added.
- Campaign validation blocks queueing if HTML/text snapshots differ from the reviewed draft, tokens are invalid, there are no recipients, consent is absent, or the audience exceeds 5,000.

## Verification

### Automated

- R2 browse ownership, allow-list, pointer containment, checksum, identity, pagination, and bounded-search tests.
- Archive UI Live/Archived switching, read-only controls, search continuation, and restore-warning tests.
- Dependency-aware selective restore, equivalent-row idempotence, divergent-row conflict, cross-owner refusal, and transaction rollback tests.
- Campaign template initialization and unsaved-edit replacement warning tests.
- HTML/text editor and sandboxed personalized-preview tests.
- Preview/queue/send parity tests for Microsoft Graph and Brevo.
- Recipient persistence across search/industry changes, Choose all matching union/deduplication, individual removal, Clear all, and 5,000-limit tests.
- Full tests, typecheck, lint, build, Deno checks, and transactional SQL security tests.

### Production acceptance

- Browse multiple pages of archived companies, deals, and contacts from the verified deleted archive without increasing live legacy row counts.
- Run a bounded archive search through completion and verify a known archived record.
- Open Edit, observe the read-only warning, restore one controlled record with dependencies, edit it live, then verify the R2 archive checksum remains unchanged.
- Select an HTML template in a campaign, edit campaign-local content, switch filters while selections persist, Choose all matching for one industry, remove recipients, Clear all, rebuild a small controlled audience, and verify final preview personalization.
- Queue only to a controlled recipient after action-time approval; verify the queued and provider payload snapshots match the final review.

## Rollout and rollback

Ship database compatibility first, then the Edge Function, then the frontend. Old clients continue using the prior campaign queue signature during the compatibility window. The archive browser is additive and can be hidden if the new read actions fail; existing full-archive restore remains unchanged.

Rollback disables the new UI and Edge actions without deleting R2 objects or campaign snapshots. Schema additions remain harmless if unused.
