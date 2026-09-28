# Sales CRM relational foundation design

Date: 2026-09-28
Status: approved for autonomous execution
Roadmap phase: B

## Intent

Deliver the first real, workspace-scoped Sales CRM vertical slice after the
workspace selector. A member of the Sales CRM workspace must be able to list,
create, edit, and delete companies, contacts, and deals without reading or
mutating another workspace. The work must stay isolated from the legacy
HubSpot schema and remain small enough for the Supabase free tier.

## Decisions

- Sales CRM records are shared by workspace members rather than private to the
  creator. The workspace is the tenant boundary.
- All new tables use the `crm_` prefix in `public`. This keeps the Supabase Data
  API simple while avoiding collisions with the legacy `companies`, `contacts`,
  and `deals` tables.
- Authenticated members may select, insert, and update workspace records.
  Deletes require the caller's membership role to be `owner` or `admin`.
- Every user-authored row records `created_by`; mutable primary records also
  record `updated_by`, `created_at`, and `updated_at`.
- Related records carry `workspace_id` and use composite foreign keys so a
  contact, deal, activity, or task cannot point across workspaces even if a UUID
  is guessed or supplied incorrectly.
- The browser uses Supabase directly under RLS. No service-role Edge Function
  is introduced for ordinary CRUD.
- List endpoints use deterministic server pagination and focused indexes.
  Search uses `pg_trgm` indexes for the name/email fields exposed by the first
  list screens.

## Schema

### Primary CRM records

`crm_companies` stores name, industry, website, domain, phone, and address
fields. Names are required and ordered by normalized name then UUID.

`crm_contacts` optionally belongs to a company and stores first, last, and full
name plus email, phone, and job title. At least one usable name or email is
required.

`crm_deals` optionally belongs to a company and stores name, stage, amount,
currency, owner user, status, last-call time, and follow-up time. Amount cannot
be negative. Currency is a normalized three-letter code.

`crm_deal_contacts` is the workspace-scoped many-to-many join between deals and
contacts.

### Future-phase foundations

`crm_activities`, `crm_tasks`, and `crm_notifications` establish the relational
contracts needed by roadmap phases E and F without prematurely building their
full interfaces.

`crm_source_imports` and `crm_source_references` establish stable Database IDs
and row lineage for phase C. The importer will populate them later; Phase B
does not retain workbook payloads in Postgres.

## Authorization and integrity

Every exposed table has RLS enabled and explicit grants. Anonymous access is
revoked. Policies use indexed `workspace_members(workspace_id, user_id)` checks
and `(select auth.uid())`; they never use user-editable metadata.

Insert/update checks require membership and require audit user columns to match
the current user where the browser supplies them. Delete checks require an
owner/admin membership. Foreign keys and checks enforce workspace consistency,
valid enumerated states, and non-negative values independently of the UI.

The executable SQL test creates two users and Sales workspaces, exercises CRUD
as one member, and proves the second workspace's identifiers return no rows and
cannot be associated cross-workspace.

## Frontend architecture

`src/lib/crm/` contains types, input normalization, pagination contracts, and
query keys. `src/hooks/crm/` contains one focused hook module per primary
resource. Hooks always receive the active workspace ID and invalidate only
workspace-scoped keys.

The Sales routes replace the generic placeholders for Dashboard, Companies,
Contacts, and Deals. Each resource page provides:

- a compact search/filter row;
- a paginated table with loading, error, empty, and count states;
- create and edit forms with client validation;
- explicit delete confirmation, available only to owner/admin roles;
- visible associations without N+1 fetches by using nested PostgREST selects.

Phase B deliberately stops before rich detail pages, timelines, reminders, and
imports. Those remain separate roadmap phases with their own acceptance gates.

## Failure behavior

- RLS denial or malformed input surfaces a safe action-level error.
- A route outside a Sales CRM workspace remains blocked by `WorkspaceRoute`.
- Cross-workspace foreign keys fail in Postgres even if a client bypasses the
  form.
- Empty pages move back to the previous page after deletion.
- Unknown Sales modules retain the generic unavailable state.

## Verification

- Migration contract tests assert tables, grants, RLS, policies, composite
  foreign keys, and focused indexes.
- The SQL isolation transaction exercises real CRUD and cross-workspace denial.
- Unit tests cover input normalization, query ranges, stable keys, and filters.
- Render tests cover list/empty/form states without mocking authorization.
- Full test, typecheck, lint, and build commands remain mandatory.
- A real authenticated browser smoke and deployed migration check are required
  before operational acceptance; lack of credentials must be reported rather
  than replaced with a claim.

## Exclusions

Workbook commit flows, detail timelines, task/reminder processing, campaign
audiences, PST parsing, and legacy R2 deletion are not Phase B work.
