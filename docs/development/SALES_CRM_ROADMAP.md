# Sales CRM multi-workspace roadmap

## Objective

Evolve QuotePulse CRM into a multi-workspace product that reuses the existing
Supabase login while keeping the HubSpot-oriented application available as
`QuotePulse Legacy`. The new `Sales CRM` workspace is the primary product and
uses workspace-scoped relational data. Cloudflare R2 remains cold/object
storage; Supabase remains the active relational database.

## Architectural boundaries

- Preserve legacy `owner_id` isolation until a separately verified migration
  has a concrete benefit. A workspace route never weakens legacy RLS.
- Give every new Sales CRM record a `workspace_id` and authorize access through
  `workspace_members`.
- Keep service-role functions explicit: authenticate the caller, resolve an
  authorized workspace, and filter every read/write by that workspace.
- Reuse the adaptive workbook parser, email queue, provider integrations, and
  verified R2 primitives behind workspace-aware adapters.
- Do not store authentication records, per-user tokens, service credentials,
  message bodies from PST files, or workbook macros in archive payloads.
- Keep large/cold payloads in R2 and searchable transactional state in
  Supabase.

## Delivery phases

### Phase A — Workspace foundation and selector

Create workspace metadata and membership RLS, provision the two default
workspaces, send authenticated users to a workspace selector, introduce
workspace-aware routes, preserve the legacy application, and add a responsive
Sales CRM shell. No legacy business table receives `workspace_id` in this
phase.

Acceptance: users can see only their memberships, select either workspace,
switch workspaces from the authenticated header, and continue using the
existing QuotePulse pages through the legacy workspace.

### Phase B — Sales CRM relational foundation

Create focused workspace-scoped tables for companies, contacts, deals, deal
contacts, activities, tasks, notifications, and source references. Add RLS,
indexes for actual list/detail queries, typed frontend access, and the Sales CRM
dashboard/navigation skeleton.

Acceptance: workspace-isolated CRUD works for companies, contacts, and deals;
cross-workspace identifiers return no data; list queries paginate.

### Phase C — Workbook imports and source lineage

Adapt the existing `.xlsx`, `.xlsm`, and `.csv` browser parser to create
`source_imports` with stable Database IDs. Expand mappings, validation,
duplicate review, commit summaries, and row-level lineage. Do not execute
macros. Move large raw/staging payloads to R2 when keeping them in Postgres is
not justified.

Acceptance: a user selects a worksheet, previews and remaps columns, reviews
errors/duplicates, imports valid records, and reconciles every imported record
to Database ID, filename, sheet, and source row.

### Phase D — Customer-facing CRM pages

Build responsive Companies, Contacts, and Deals lists/details with search,
sort, filters, pagination, associations, source references, and relevant email
history. Add a deliberate CRM visual system instead of cloning the dense
legacy dashboard.

Acceptance: the principal desktop and mobile journeys are usable with realistic
data and rendered-browser evidence.

### Phase E — Activities, notes, and call logs

Use one activity model for notes, call logs, and system/task events. Support
author, timestamp, text, company/deal associations, and an optional Last Call
Date update. Render chronological timelines on company and deal pages.

Acceptance: users can add notes/calls and see correctly ordered, authorized
timeline entries without duplicating activity logic.

### Phase F — Tasks, reminders, and notifications

Add follow-up task creation from the note workflow, assignees, due/reminder
timestamps, statuses, Today shortcuts, and a dedicated task view. Use a bounded
scheduled backend worker to materialize durable in-app notifications. Add Web
Push only after the durable in-app path works.

Acceptance: reminders survive a closed browser, scheduled work is idempotent,
and task groupings correctly distinguish overdue, today, upcoming, and
completed.

### Phase G — Email campaigns

Generalize the existing templates and queue rather than creating a second send
engine. Add workspace/campaign identity, recipient snapshots, vertical and CRM
filters, selected-contact audiences, and campaign reporting while preserving
leases, cooldowns, limits, consent, unsubscribe behavior, and explicit
service-role filters.

Acceptance: audience construction is deterministic and workspace-safe; queued,
sent, deferred, blocked, and failed states remain observable.

### Phase H — PST extractor spike and productization

First run a separately approved technical spike against multiple non-sensitive
PST variants. Evaluate a browser ArrayBuffer parser in a Web Worker and retain a
parser abstraction. Normalize/deduplicate sender and recipient addresses and
associate subjects without persisting bodies or attachments. If realistic
variants fail, select and test an isolated fallback before promising support.

Acceptance: supported variants have fixture-backed extraction and unsupported
files fail explicitly. Large subject payloads use R2 when appropriate.

### Phase I — Full legacy workspace archive and restore

Inventory the legacy dependency graph and define an explicit allow-list that
excludes auth and secrets. Extend existing R2 signing, gzip, checksums, and
owner-scoped keys into bounded resumable workspace objects plus a versioned
manifest. Read back and verify every object. Record a verified archive pointer
before records can become deletion-eligible. Implement read/restore before an
explicit deletion phase.

Acceptance: retries resume safely; every row count and checksum reconciles;
dry-run deletion refuses incomplete/unverified archives; existing R2 recovery
flows still work.

### Phase J — Security, performance, and production validation

Run cross-workspace RLS and service-role tests, formula-injection checks,
untrusted-file limits, query/index reviews, responsive and accessibility QA,
full build verification, deployment checks, and authenticated browser smoke
tests. Record exact deployment and migration evidence without treating a green
frontend build as database proof.

## Cross-phase verification gates

Each phase must have focused tests added before implementation, GitNexus impact
analysis before edits to existing symbols, GitNexus change detection before
commit, and the relevant subset of:

```text
npm test
npm run typecheck
npm run lint
npm run build
Supabase SQL/RLS tests and lint
rendered browser smoke tests
```

Deployment is separate from implementation completion. Hosted migrations,
Edge Functions, scheduled jobs, secrets, and authenticated flows require direct
evidence before they are reported as working.

## Durable handoff format

At every phase boundary record the branch, commit, schema changes, environment
requirements, tests run, deployment state, blockers, and exact next action.
Keep legacy archival eligibility and deletion state explicit.
