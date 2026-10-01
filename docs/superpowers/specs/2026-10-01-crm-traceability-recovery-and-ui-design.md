# CRM traceability, recovery, and UI completion design

Date: 2026-10-01
Status: approved for autonomous implementation

## Intent

Complete the Sales CRM so users can understand where every record came from,
see and navigate its relationships, customize all meaningful table columns,
search without disruptive refreshes, enrich incomplete company records, round
trip workbook activities deliberately, and safely remove or restore individual
records or complete import sources.

The feature must preserve workspace isolation, avoid turning arbitrary workbook
columns into an unbounded Postgres schema, and use private R2 recovery archives
to keep deleted payloads out of Supabase while they remain restorable for 30
days.

## Product decisions

- Main CRM columns remain selected by default. Additional normalized CRM fields
  are always available in the column picker. Original workbook columns are
  available when a workbook source filter is active.
- Column choices persist per user and workspace. Core-column preferences are
  table-specific; original-column preferences are also source-specific.
- Workbook and PST imports are first-class sources with a visible filename,
  stable database ID, checksum, status, timestamps, counts, and source type.
- Clicking a source badge filters the current list to that source. A clearly
  labelled Clear filter action returns the list to its normal state.
- Companies, contacts, deals, activities, tasks, and sources remain linked by
  explicit workspace-scoped relationships. Detail screens are the canonical
  relationship view; list rows provide compact relationship and source links.
- A source deletion never silently destroys a record that is shared with
  another source. Shared records retain their other lineage; source-only data
  is archived and removed.
- Destructive source operations require owner/admin permission, a count preview,
  and exact typed confirmation using the displayed source filename.
- Deleted payloads are recoverable for 30 days from the Sales CRM recycle bin.
  Recovery archives live in private R2; Postgres retains only a compact manifest
  and operational metadata. Expired archive objects and manifests are purged by
  an idempotent scheduled maintenance path.
- Industry classification runs automatically only when industry is blank. It
  reuses the deterministic legacy classifier and records that provenance.
  Public-search enrichment for industry, website, location, and phone remains
  an explicit user action because it consumes external API quota.
- Manual activities remain CRM-only unless the user explicitly assigns them to
  a workbook source row and mapped activity column. Explicitly assigned calls,
  remarks, or comments participate in source-preserving export.
- PST extraction continues to leave the raw PST on the user's device. Parsed
  message content is stored as a private, checksummed R2 source archive;
  bounded searchable metadata and previews remain in Postgres.
- PST sender and recipient email addresses match existing workspace contacts or
  create email-based contacts when no match exists. Every link retains the PST
  source and message identity.

## Source and column architecture

### Normalized columns

Expand `CRM_COLUMN_OPTIONS` for companies, contacts, and deals to cover every
normalized field the list query can safely render, including timestamps,
addresses, owners, activity dates, source summary, and relationship counts.
Defaults remain intentionally compact. A picker search and grouped sections
prevent the menu from becoming unwieldy.

Column preferences move from account-global table keys to a versioned
workspace-aware structure. Existing preferences are read through a backwards-
compatible adapter and migrated on the next save. A user can restore defaults
without affecting other workspaces or tables.

### Original workbook columns

The original workbook remains the durable source of arbitrary cells. Import
creates a compressed, private R2 row index beside the existing workbook
template. The index contains the source row number, original headers, and cell
values required for source-filtered display; it does not execute formulas or
macros.

When a source filter is active, the list query returns matching entity IDs and
source row numbers. A workspace-authorized Edge Function reads the verified R2
row index and returns only the requested page and selected columns. Source-only
columns therefore remain available without duplicating arbitrary workbook data
inside Postgres. General cross-source lists show normalized columns only.

Older imports without an R2 row index continue to show normalized columns and
an explanatory unavailable state for original fields. They are not falsely
presented as fully source-preserving.

## Provenance and relationship experience

Company, contact, and deal list rows gain a compact source badge. Multiple
sources collapse into a count with an accessible popover. Selecting a source
badge applies the exact source filter, announces the active filter, resets
pagination, and exposes the Clear filter action.

Relationship cells link to the related company, contact, or deal. Detail pages
retain their existing association sections and add related tasks plus clearer
cross-links so the path company -> contacts -> deals -> tasks is visible rather
than implied. The source rail accepts both workbook and PST lineage.

Source lineage records include source type, filename, import ID, row/message
identity, and captured timestamp. Provenance is additive: later imports do not
erase earlier sources.

## Activity timeline and workbook round trip

The timeline uses one stable card layout for calls, notes, and task updates,
with a visible type marker, author, timestamp, body, related task, and source.
Long text wraps and collapses safely; metadata cannot overlap the body at narrow
widths. Empty, loading, error, and truncated states have distinct treatments.

The activity composer optionally exposes a workbook destination only when the
record has workbook lineage. The user chooses the source, source row, and one
of its mapped activity fields. The database enforces that the selected row and
column belong to that source and record.

Export keeps the original workbook layout and unknown cells. For each mapped
Call Log, Remarks, or Comments cell, it writes the newest explicitly assigned
activity for that exact source row and column. Unassigned manual activities do
not overwrite a workbook. When several activities target one cell, export uses
a deterministic newest-first combined value with timestamps rather than
silently discarding earlier entries. Unparseable original activity dates remain
untouched.

## Company classification and enrichment

Workbook and PST-driven company creation applies the existing deterministic
`classifyIndustry` logic only when no imported/user-entered industry exists.
The stored provenance distinguishes `workbook`, `user`, `classifier`, and
`public_enrichment` values so later automation cannot overwrite stronger data.

Company lists and details provide an Enrich missing details action for selected
records and a bounded batch action. It reuses the existing KYC search and merge
rules but targets workspace-scoped CRM companies. It fills only blank industry,
website/domain, phone, and address fields unless the user explicitly approves a
conflict. Missing SEARCH_API_KEY or quota failures surface as actionable errors
and never return a false success state.

## PST ingestion and search

The browser worker additionally extracts display names and sanitized text body
content within the existing file, message-count, and metadata limits. It sends
bounded batches to an authenticated Edge Function. The function:

1. verifies workspace membership and import identity;
2. writes a compressed checksummed message archive to a private R2 key scoped
   by owner, workspace, and mailbox import;
3. persists subject, addresses, date, folder, attachment flag, bounded preview,
   and archive pointer in Postgres;
4. matches or creates contacts by normalized email and writes message-contact
   links with source provenance; and
5. marks the import complete only after archive verification and database
   counts agree.

Saved mailbox search is debounced and covers subject, addresses, filename, and
bounded preview. Results display the PST filename and folder. Import files and
individual saved messages expose deletion actions according to role.

## Search and loading behavior

Contacts, deals, companies, PST messages, and campaign audiences use a shared
debounced-search hook. The visible input updates immediately, while network
queries wait briefly for typing to settle. TanStack Query retains the previous
page during the request and shows a small updating indicator instead of
blanking or remounting the screen. Search errors preserve the prior results and
remain visible. Clearing search cancels obsolete requests and restores the
unfiltered key.

Campaign audience filtering uses a server-side, workspace-scoped search RPC or
an equivalent safely escaped query that searches name, email, and company
together. It returns a deterministic count and page so selection and “all
matching” cannot drift during typing.

## Deletion, R2 recovery, and retention

Introduce compact deletion manifests containing workspace, actor, target type,
target/source identity, display name, record counts, R2 key, checksum, archive
status, created time, and expiry time. Manifest rows use RLS for member reads
and owner/admin restore/delete actions. Privileged functions re-check the
authenticated workspace role and never trust a client-supplied owner ID.

Deletion is a resumable state machine:

1. calculate and display affected, shared-preserved, and relationship counts;
2. require exact typed confirmation for a full source;
3. serialize the bounded deletion graph to private R2;
4. read it back and verify identity, checksum, workspace, and counts;
5. atomically remove or detach the hot rows and mark the manifest restorable;
6. expose Restore and Delete permanently actions in the recycle bin; and
7. purge expired R2 objects through the R2 API before removing their manifests.

Individual record deletion follows the same archive-first rule. A source delete
archives source metadata, source-specific activities/messages/references, and
records that have no other live lineage. Companies and contacts shared with
other sources are retained. Deals with another source are retained; otherwise
they are archived with their joins and activities. A preview communicates this
before confirmation.

Restore is idempotent and validates all workspace-scoped foreign keys before
writing. Partial failure leaves the manifest and R2 object intact with a retry
state. R2 upload or verification failure prevents deletion. Moving rows to R2
does not claim immediate PostgreSQL space reclamation; existing guarded storage
maintenance and compaction remain the authority for recovered capacity.

## Header logo defect

The compact `WorkspaceBrand` currently uses a 6.75 rem by 3.25 rem clipped box
with a full-size contained image, which makes the R Systems mark dominate the
QuotePulse header and can crop its transparent artwork. Give compact brands an
explicit, smaller responsive image box, use `object-fit: contain`, avoid hidden
overflow around the artwork, and keep the QuotePulse title, workspace label,
workspace switcher, account controls, and navigation aligned.

Acceptance sizes include 320, 375, 768, 1024, and 1440 CSS pixels. The complete
logo must remain visible without increasing the header height, colliding with
text, or forcing desktop controls onto an unnecessary second line. The larger
workspace-selector brand treatment remains unchanged.

## Authorization and safety

- All new public tables enable RLS and explicitly revoke anonymous access.
- Member reads and writes are constrained by indexed workspace membership.
- Archive, restore, permanent-delete, enrichment, and source-content functions
  derive the caller with verified authentication and scope every service-role
  query by workspace plus immutable object identity.
- R2 keys include owner and workspace containment; reads verify pointer scope
  and checksums before parsing.
- Imported text is rendered as text, never HTML. Formula-like workbook strings
  retain spreadsheet-export escaping.
- Source deletes cannot cross workspaces or delete shared records without the
  previewed lineage rule.
- All archive and batch endpoints enforce byte, row, and execution budgets and
  return explicit partial/retry states instead of false success.

## Delivery sequence

1. Fix compact logo sizing, column-picker completeness/persistence, debounced
   searches, loading stability, and activity timeline layout.
2. Add source badges, source filtering, Clear filter, relationship/task links,
   and source-aware original workbook columns backed by an R2 row index.
3. Add activity-to-workbook assignment and deterministic round-trip export.
4. Add deterministic industry classification and bounded optional enrichment.
5. Extend PST archives, contact creation/matching, filename provenance, search,
   and deletion controls.
6. Add archive-first source/record deletion, recycle bin restoration, and
   30-day R2 expiry maintenance.

Each slice must be independently deployable and keep existing CRM records and
older imports readable.

## Verification and acceptance

- Unit tests cover grouped columns, preference migration, debounce/cancellation,
  source-filter state, industry precedence, activity export selection, PST
  normalization, deletion previews, and archive state transitions.
- Migration contract and PostgreSQL tests cover grants, RLS, workspace
  isolation, shared-lineage preservation, restore idempotency, and expiry.
- Edge Function tests cover R2 containment, checksums, bounded batches,
  retry/failure behavior, and no-delete-on-archive-failure.
- Workbook round-trip fixtures prove unknown columns and formatting survive and
  only explicitly assigned activity cells change.
- Browser tests cover all three lists, saved column choices, source badge and
  Clear filter behavior, relationship navigation, timeline wrapping, debounced
  audience search, PST provenance, typed source deletion, recycle restoration,
  and permanent deletion.
- Rendered screenshots at the required widths verify the complete compact logo,
  column menu, list tables, detail relationships, and activity timeline.
- `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` must pass.
- Supabase migration/function deployment, R2 configuration, scheduled purge,
  and authenticated production flows require direct evidence before they are
  reported as operationally complete.

## Compatibility and exclusions

Legacy HubSpot records and their existing recycle bin remain unchanged. This
design reuses shared classifiers and R2 primitives but does not merge the
legacy and Sales CRM schemas. The raw PST file is not uploaded. Automatic paid
enrichment is excluded. Shared-record source deletion is deliberately
lineage-aware rather than a blind cascade.
