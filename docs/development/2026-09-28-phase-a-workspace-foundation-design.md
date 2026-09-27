# Phase A design: workspace foundation and selector

## Intent

After a successful Supabase login, a user chooses between `QuotePulse Legacy`
and `Sales CRM`. The legacy workspace keeps the current owner-scoped HubSpot
application operational. The Sales CRM workspace establishes the navigation
and security boundary for new workspace-scoped CRM data without forcing a risky
rewrite of the legacy schema.

Phase A succeeds when the workspace boundary is enforced by the database, the
selector is the authenticated landing page, switching is reliable on mobile
and desktop, and all current legacy routes remain reachable inside the legacy
workspace.

## Assumptions

- Each current and newly registered user receives one private Legacy workspace
  and one private Sales CRM workspace.
- The schema supports multiple members and roles, but invitation/member
  management UI is not part of Phase A.
- Existing legacy rows continue to belong to their `owner_id`; selecting a
  legacy workspace does not change or replace that authorization.
- The Sales CRM shell may show intentional empty states in Phase A. Business
  data tables arrive in Phase B.
- No legacy record is archived, compacted, restored, or deleted in Phase A.

## Selected approach

Use a sidecar workspace model. Add workspace metadata and membership without
adding `workspace_id` to existing HubSpot tables. New Sales CRM tables will
reference `workspaces.id` beginning in Phase B.

This is preferred over an immediate legacy retrofit because existing Edge
Functions use the service role and are safe only when every query carries its
current explicit owner filter. It is preferred over UI-only workspace labels
because membership must be enforceable in RLS.

## Database model

### `workspaces`

- `id uuid primary key`
- `name text not null`
- `kind text not null check (kind in ('legacy', 'sales_crm'))`
- `created_by uuid not null references auth.users(id)`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`
- unique `(created_by, kind)` for the Phase A default pair

The uniqueness rule is intentionally limited to the default per-user model. A
future collaboration phase must replace it before allowing multiple workspaces
of the same kind for one creator.

### `workspace_members`

- `workspace_id uuid references workspaces(id) on delete cascade`
- `user_id uuid references auth.users(id) on delete cascade`
- `role text not null check (role in ('owner', 'admin', 'member'))`
- `created_at timestamptz not null`
- primary key `(workspace_id, user_id)`
- index `(user_id, workspace_id)` for selector and route authorization

Authenticated users may select only membership rows where `user_id =
auth.uid()`. They may select a workspace only when such a membership exists.
Phase A does not grant browser insert/update/delete access to either table.

### `workspace_archives`

This table stores metadata only; R2 remains the archive payload store.

- `id uuid primary key`
- `workspace_id uuid references workspaces(id) on delete restrict`
- `archive_version integer not null`
- `schema_version text not null`
- `status text not null` with explicit building, verified, failed,
  deletion-eligible, and deleted states
- `manifest_key text`
- `manifest_sha256 text`
- `table_counts jsonb not null default '{}'`
- `created_by uuid references auth.users(id)`
- `created_at`, `verified_at`, and `deleted_at` timestamps

Members may read archive metadata for their workspace. Phase A grants no
browser mutation policy. Later archival functions must authenticate and filter
the workspace explicitly before using the service role.

### Provisioning

A locked-down database function creates the two default workspaces and owner
memberships idempotently. The migration invokes it for existing `auth.users`.
An `after insert` trigger on `auth.users` provisions future accounts.

Any `security definer` helper must live outside the exposed API schema, pin its
`search_path`, validate non-null user identity, use conflict-safe inserts, and
have default `PUBLIC` execution revoked. The provisioning function is invoked
by the trigger, not exposed as a general browser RPC.

## RLS and authorization

- Enable RLS on every new public table.
- `workspace_members`: users select their own membership records only.
- `workspaces`: users select rows for which their own membership exists.
- `workspace_archives`: users select metadata only through a membership check.
- Do not authorize through editable `user_metadata` or a client-supplied role.
- Do not expose service-role or R2 credentials to the browser.
- Preserve all existing owner policies on legacy tables.

The initial policies avoid recursive membership administration. Future member
management requires a separately reviewed authorization helper and tests for
owner/admin role changes.

## Frontend routes and state

Routes become:

```text
/login, /signup, /forgot-password, /auth/callback  public auth routes
/workspaces                                        authenticated selector
/w/:workspaceId/legacy                            legacy dashboard
/w/:workspaceId/legacy/company/:id                legacy company detail
/w/:workspaceId/legacy/uploads/...                legacy uploaded files
/w/:workspaceId/legacy/templates                  legacy templates
/w/:workspaceId/legacy/trash                      legacy recycle bin
/w/:workspaceId/legacy/settings                   legacy settings
/w/:workspaceId/sales                             Sales CRM dashboard shell
/w/:workspaceId/sales/<module>                    reserved Sales CRM modules
```

Authenticated `/` redirects to `/workspaces`. Existing flat authenticated URLs
redirect to the selector rather than guessing a workspace. This avoids opening
a workspace the user did not explicitly choose. Auth callbacks keep their
current public paths.

`WorkspaceProvider` loads the signed-in user's workspace/membership projection
with a query key containing the user ID. `WorkspaceRoute` resolves the route ID,
requires membership, and verifies the route family matches `workspace.kind`.
Unknown, inaccessible, or mismatched workspaces render a safe not-found/access
state and never briefly render protected content.

The URL is the source of truth for the active workspace. No authorization
decision relies on local storage. The switcher navigates to the selected
workspace's landing page.

## User interface

### Selector

The selector presents two purposeful choices rather than generic identical
cards:

- QuotePulse Legacy: historical HubSpot workflows and archive status.
- Sales CRM: the primary Excel-driven customer workspace.

Each choice explains what opens. Loading, zero-membership, and query-error
states provide a concrete recovery action. The selector remains usable with a
keyboard and on a narrow mobile viewport.

### Authenticated shell

Create one shell component that accepts workspace-specific navigation. The
header includes product identity, current workspace, a switch control, user
identity, and sign out. The Sales CRM navigation contains Dashboard, Companies,
Contacts, Deals, Tasks, Email Campaigns, Imports, PST Extractor, and Settings.
The legacy navigation preserves its current capabilities and labels.

The visual direction is a calm operational CRM: high information clarity,
strong current-location cues, restrained color, and one distinctive workspace
identity element. It must not become a grid of interchangeable rounded cards.
The implementation will define and critique concrete tokens before UI code, per
the frontend design workflow.

## Error handling

- A workspace query failure does not fall back to an unscoped legacy page.
- A user with no memberships sees a support/retry state, not an empty selector.
- A route for another user's UUID returns a generic inaccessible/not-found
  state without confirming that the workspace exists.
- Provisioning is idempotent, so migration or trigger retries do not create
  duplicates.
- A workspace switch clears or separates workspace-specific query cache keys;
  account changes continue to clear the complete query cache through the
  existing auth provider.

## Tests

Implementation follows test-first development.

### Database

- Backfill creates exactly two default workspaces and owner memberships per
  existing user.
- Provisioning reruns without duplicates.
- A new auth user receives both workspaces.
- A user cannot select another user's workspace, membership, or archive
  metadata.
- Authenticated roles cannot mutate workspace/archive metadata directly.
- Required RLS, grants, constraints, and indexes exist.

### Frontend

- Authenticated `/` resolves to the selector.
- Workspace cards use rows returned for the current user.
- Valid legacy and Sales CRM selections navigate to the correct route.
- Missing, mismatched, and inaccessible workspace routes do not render child
  pages.
- The switcher navigates between workspace landing pages.
- Legacy links are generated beneath the active legacy workspace.
- Sales CRM navigation contains every required primary module.

### Regression and rendered checks

- `npm test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- applicable migration parser/local database/RLS tests
- desktop and mobile browser smoke checks for selector, switcher, legacy shell,
  and Sales CRM shell

## Phase A exclusions

- Sales CRM business tables or CRUD
- importing into Sales CRM
- invitation/member administration
- task reminder workers or Web Push
- campaign queue changes
- PST parsing
- creation, verification, restoration, or deletion of legacy archive payloads
- production deployment or migration application without separate direct
  evidence

## Delivery sequence

1. Add failing migration/security tests for workspace schema and isolation.
2. Add the timestamped imperative migration and verify the database tests.
3. Add failing frontend tests for workspace resolution and route decisions.
4. Implement workspace types, query/context, selector, and route guard.
5. Add failing navigation/shell tests, then implement legacy and Sales shells.
6. Run focused and full verification plus rendered browser inspection.
7. Run GitNexus change detection, commit coherent units, and update the handoff.

Phase B begins only after Phase A database and browser behavior are verified.
