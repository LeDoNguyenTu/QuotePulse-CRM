# Workspace Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add database-enforced workspaces, make the workspace selector the authenticated landing page, and preserve the legacy application beneath a workspace-aware responsive shell.

**Architecture:** Add sidecar workspace and membership tables without changing legacy business-table ownership. A user-scoped workspace provider feeds a route guard; the URL identifies the active workspace, and one shell renders legacy or Sales CRM navigation. The Sales CRM area contains navigation-ready empty states only; its relational model begins in Phase B.

**Tech Stack:** PostgreSQL 17/Supabase RLS and Auth triggers, React 18, React Router 6, TanStack Query 5, TypeScript 5.6, Tailwind CSS 3, Vitest 2.

**Spec:** `docs/development/2026-09-28-phase-a-workspace-foundation-design.md`

## Global Constraints

- Preserve the existing legacy `owner_id` and `created_by` authorization model.
- Every new table in `public` has RLS, explicit grants, and indexed policy predicates.
- Browser roles receive read-only access to workspace metadata in Phase A.
- Service-role and R2 credentials never enter browser code or migration data.
- The active workspace comes from the URL; local storage is not an authorization source.
- Use a 14-digit timestamped imperative migration.
- Implement behavior test-first and run GitNexus impact analysis before changing existing symbols.
- No archive payload is created and no legacy row is modified or deleted.

## Review Focus

- A valid user opening another user's workspace UUID sees a generic inaccessible state; Task 3 tests this through `resolveWorkspaceRoute`.
- A legacy workspace paired with a `/sales` route, or a Sales workspace paired with `/legacy`, is rejected; Task 3 tests both mismatches.
- A user with no memberships gets an actionable selector state rather than an empty screen; Task 4 renders and asserts that state.
- Provisioning is retried for an existing user without duplicate workspaces or memberships; Task 1 tests conflict-safe SQL and a database transaction when available.
- Narrow mobile layouts retain a reachable workspace switcher and module navigation; Task 4 adds responsive markup and Task 5 verifies it in a rendered browser.

---

### Task 1: Workspace schema, provisioning, and RLS

**Files:**
- Create: `supabase/migrations/20260928100000_workspace_foundation.sql`
- Create: `supabase/migrations/20260928100000_workspace_foundation.test.ts`
- Create: `supabase/tests/workspace_isolation.sql`

**Interfaces:**
- Consumes: `auth.users(id)` and the repository's existing `public.set_updated_at()` trigger function.
- Produces: `public.workspaces`, `public.workspace_members`, `public.workspace_archives`, and trigger-only `private.ensure_default_workspaces(uuid)`.

- [ ] **Step 1: Write the failing migration contract test**

Create a Vitest file that reads the migration and asserts all three tables, RLS on each table, the two workspace kinds, `(workspace_id, user_id)` membership identity, the leading `user_id` membership index, explicit authenticated read grants, revoked browser writes, fixed empty function `search_path`, revoked function execution, existing-user backfill, and an `auth.users` insert trigger.

```ts
const sql = readFileSync(new URL('./20260928100000_workspace_foundation.sql', import.meta.url), 'utf8').toLowerCase();

expect(sql).toContain('create table if not exists public.workspaces');
expect(sql).toContain('create table if not exists public.workspace_members');
expect(sql).toContain('create table if not exists public.workspace_archives');
expect(sql).toMatch(/alter table public\.(workspaces|workspace_members|workspace_archives) enable row level security/g);
expect(sql).toContain("kind in ('legacy', 'sales_crm')");
expect(sql).toMatch(/create index[^;]+workspace_members[^;]+\(user_id, workspace_id\)/s);
expect(sql).toMatch(/security definer\s+set search_path = ''/);
expect(sql).toMatch(/revoke all on function private\.ensure_default_workspaces\(uuid\) from public, anon, authenticated/);
expect(sql).toContain('after insert on auth.users');
```

- [ ] **Step 2: Run the contract test and confirm RED**

Run: `npm test -- --run supabase/migrations/20260928100000_workspace_foundation.test.ts`

Expected: FAIL because the migration file does not exist.

- [ ] **Step 3: Create the timestamped migration and minimal schema**

Use `npx supabase migration new workspace_foundation` to create the CLI migration stub, rename that empty stub to the exact planned path if necessary, then populate it. Create:

```sql
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  kind text not null check (kind in ('legacy', 'sales_crm')),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (created_by, kind)
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index workspace_members_user_workspace_idx
  on public.workspace_members (user_id, workspace_id);
```

Add `workspace_archives` with the columns and state check from the spec, an index on `(workspace_id, created_at desc)`, updated-at trigger for workspaces, and RLS on all three tables.

- [ ] **Step 4: Add explicit grants and read-only RLS**

Revoke all table privileges from `anon` and `authenticated`; grant `select` on the three tables to `authenticated`; grant all to `service_role`. Policies must use `to authenticated` and `(select auth.uid())`:

```sql
create policy workspace_members_select_own
on public.workspace_members for select to authenticated
using ((select auth.uid()) = user_id);

create policy workspaces_select_member
on public.workspaces for select to authenticated
using (exists (
  select 1 from public.workspace_members member
  where member.workspace_id = workspaces.id
    and member.user_id = (select auth.uid())
));
```

Use the equivalent membership predicate for archive metadata. Add no browser write policy.

- [ ] **Step 5: Add idempotent default provisioning**

Create private schema if absent and define `private.ensure_default_workspaces(p_user_id uuid)` as `security definer set search_path = ''`. It rejects null IDs, inserts the two kinds with `on conflict (created_by, kind) do update set name = excluded.name returning id`, and inserts owner membership with `on conflict do nothing`. Revoke function execution from `public`, `anon`, and `authenticated`; grant execute only to `service_role` and `supabase_auth_admin` if the latter role exists. Backfill by iterating `auth.users.id`, then create a trigger function and `after insert on auth.users` trigger that calls the helper. Keep both functions in `private` and schema-qualify every object.

- [ ] **Step 6: Add transactional pgTAP/RLS coverage**

Create `supabase/tests/workspace_isolation.sql` with a transaction that creates two test auth users, invokes provisioning as a privileged test setup, authenticates as each user, asserts exactly two visible workspaces/two memberships, asserts no visibility of the other user, asserts direct insert/update/delete fail, invokes provisioning again, and asserts counts remain two. Roll back at the end.

- [ ] **Step 7: Run migration tests and confirm GREEN**

Run: `npm test -- --run supabase/migrations/20260928100000_workspace_foundation.test.ts`

If a local Supabase stack is available, also run: `npx supabase test db`

Expected: contract tests PASS; database tests PASS or an exact environment blocker is recorded without weakening assertions.

- [ ] **Step 8: Commit the database boundary**

Run GitNexus change detection, then:

```bash
git add supabase/migrations/20260928100000_workspace_foundation.sql supabase/migrations/20260928100000_workspace_foundation.test.ts supabase/tests/workspace_isolation.sql
git commit -m "feat(db): add workspace membership foundation"
```

### Task 2: Workspace domain and account-scoped query provider

**Files:**
- Create: `src/lib/workspaces.ts`
- Create: `src/lib/workspaces.test.ts`
- Create: `src/hooks/useWorkspaces.tsx`
- Modify: `src/main.tsx`

**Interfaces:**
- Consumes: `useAuth()`, Supabase `workspace_members` read access, TanStack Query.
- Produces: `Workspace`, `WorkspaceKind`, `WorkspaceRole`, `workspaceLandingPath(workspace)`, `WorkspaceProvider`, `useWorkspaces()`, and `useActiveWorkspace()`.

- [ ] **Step 1: Write failing domain tests**

Test exact landing paths and response normalization:

```ts
expect(workspaceLandingPath({ id: 'legacy-id', kind: 'legacy', name: 'QuotePulse Legacy', role: 'owner' }))
  .toBe('/w/legacy-id/legacy');
expect(workspaceLandingPath({ id: 'sales-id', kind: 'sales_crm', name: 'Sales CRM', role: 'owner' }))
  .toBe('/w/sales-id/sales');
expect(normalizeWorkspaceMemberships([{ role: 'owner', workspaces: { id: 'a', name: 'Sales CRM', kind: 'sales_crm' } }]))
  .toEqual([{ id: 'a', name: 'Sales CRM', kind: 'sales_crm', role: 'owner' }]);
expect(normalizeWorkspaceMemberships([{ role: 'owner', workspaces: null }])).toEqual([]);
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm test -- --run src/lib/workspaces.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the pure workspace domain**

Define narrow union types and reject malformed rows rather than asserting them:

```ts
export type WorkspaceKind = 'legacy' | 'sales_crm';
export type WorkspaceRole = 'owner' | 'admin' | 'member';
export interface Workspace { id: string; name: string; kind: WorkspaceKind; role: WorkspaceRole }
export function workspaceLandingPath(workspace: Pick<Workspace, 'id' | 'kind'>): string;
export function normalizeWorkspaceMemberships(rows: unknown): Workspace[];
```

- [ ] **Step 4: Run domain tests and confirm GREEN**

Run: `npm test -- --run src/lib/workspaces.test.ts`

Expected: PASS.

- [ ] **Step 5: Implement the provider**

Query `workspace_members` with `workspaces!inner(id,name,kind)` and query key `accountQueryKey(user?.id, ['workspaces'])`. Expose:

```ts
interface WorkspaceContextValue {
  workspaces: Workspace[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
}
```

Create a separate active-workspace context whose provider accepts a verified `Workspace`. `useActiveWorkspace()` throws outside that provider. Wrap `App` with `WorkspaceProvider` inside `AuthProvider` in `src/main.tsx` so account changes continue to clear query state.

- [ ] **Step 6: Run focused and type tests**

Run:

```bash
npm test -- --run src/lib/workspaces.test.ts src/lib/accountQueryScope.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit the workspace data layer**

After GitNexus change detection:

```bash
git add src/lib/workspaces.ts src/lib/workspaces.test.ts src/hooks/useWorkspaces.tsx src/main.tsx
git commit -m "feat: add workspace query context"
```

### Task 3: Workspace route authorization

**Files:**
- Create: `src/lib/workspaceRoutes.ts`
- Create: `src/lib/workspaceRoutes.test.ts`
- Create: `src/components/WorkspaceRoute.tsx`

**Interfaces:**
- Consumes: `Workspace[]` and route parameters `workspaceId` plus area `legacy | sales`.
- Produces: `resolveWorkspaceRoute(workspaces, workspaceId, area)` and `WorkspaceRoute({ area, children })`.

- [ ] **Step 1: Write failing authorization tests**

Cover valid legacy and Sales routes, missing ID, unknown ID, and both kind mismatches:

```ts
expect(resolveWorkspaceRoute(workspaces, 'legacy-id', 'legacy')).toEqual({ status: 'allowed', workspace: workspaces[0] });
expect(resolveWorkspaceRoute(workspaces, 'other-user-id', 'sales')).toEqual({ status: 'inaccessible' });
expect(resolveWorkspaceRoute(workspaces, 'legacy-id', 'sales')).toEqual({ status: 'inaccessible' });
expect(resolveWorkspaceRoute(workspaces, 'sales-id', 'legacy')).toEqual({ status: 'inaccessible' });
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm test -- --run src/lib/workspaceRoutes.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the pure resolver**

Return a discriminated union:

```ts
type WorkspaceRouteResult =
  | { status: 'loading' }
  | { status: 'error'; error: Error }
  | { status: 'inaccessible' }
  | { status: 'allowed'; workspace: Workspace };
```

Map `legacy` to `kind === 'legacy'` and `sales` to `kind === 'sales_crm'`.

- [ ] **Step 4: Implement the route guard**

Read `workspaceId` from `useParams`, combine it with `useWorkspaces`, render a full-page spinner while loading, a retryable error for query failure, and the same generic inaccessible message for unknown/mismatched workspaces. Only the allowed branch renders `ActiveWorkspaceProvider` and children.

- [ ] **Step 5: Run focused tests and confirm GREEN**

Run: `npm test -- --run src/lib/workspaceRoutes.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit route authorization**

After GitNexus change detection:

```bash
git add src/lib/workspaceRoutes.ts src/lib/workspaceRoutes.test.ts src/components/WorkspaceRoute.tsx
git commit -m "feat: guard workspace routes"
```

### Task 4: Selector and responsive workspace shell

**Files:**
- Create: `src/pages/WorkspaceSelector.tsx`
- Create: `src/pages/WorkspaceSelector.test.tsx`
- Create: `src/pages/SalesWorkspacePage.tsx`
- Create: `src/lib/workspaceNavigation.ts`
- Create: `src/lib/workspaceNavigation.test.ts`
- Modify: `src/components/Layout.tsx`
- Modify: `src/styles/index.css`

**Interfaces:**
- Consumes: `useWorkspaces()`, `useActiveWorkspace()`, `workspaceLandingPath()`.
- Produces: `WorkspaceSelector`, `WorkspaceSelectorView`, `workspaceNavigation(kind, workspaceId)`, workspace-aware `Layout`, and `SalesWorkspacePage`.

- [ ] **Step 1: Write failing selector and navigation tests**

Static-render `WorkspaceSelectorView` with two workspaces and assert names, descriptions, and exact links. Render it with an empty array and assert `No workspaces are available` plus a Retry action. Test navigation labels:

```ts
expect(workspaceNavigation('sales_crm', 'sales-id').map((item) => item.label)).toEqual([
  'Dashboard', 'Companies', 'Contacts', 'Deals', 'Tasks',
  'Email Campaigns', 'Imports', 'PST Extractor', 'Settings',
]);
expect(workspaceNavigation('legacy', 'legacy-id')[0].to).toBe('/w/legacy-id/legacy');
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm test -- --run src/pages/WorkspaceSelector.test.tsx src/lib/workspaceNavigation.test.ts`

Expected: FAIL because the components/modules do not exist.

- [ ] **Step 3: Implement and review the visual token plan**

Before JSX, record the Phase A tokens in `src/styles/index.css` comments and variables: ink/navy operational base, cool white canvas, blue workspace accent, teal verified/safe accent, compact humanist sans typography from the current system stack, a persistent desktop rail/topbar relationship, and a mobile horizontal module scroller. Remove any decorative card treatment that does not communicate workspace identity or state.

- [ ] **Step 4: Implement selector states**

`WorkspaceSelector` maps the provider state to `WorkspaceSelectorView`. The view sorts Legacy before Sales CRM, gives each a plain-language description, and links with `workspaceLandingPath`. It has loading, retryable error, and actionable zero-membership states. Use semantic links, headings, visible focus, and no authorization decisions beyond provider results.

- [ ] **Step 5: Implement workspace navigation and shell**

Change `Layout` to consume `useActiveWorkspace()` and accept `area: 'legacy' | 'sales'`. It renders the matching navigation, workspace switch control linking to `/workspaces`, user email, sign out, and either `children` or an outlet-compatible content region. Keep all legacy destinations but prefix them with `/w/:workspaceId/legacy`. Sales destinations use `/w/:workspaceId/sales[/module]`.

Create `SalesWorkspacePage` that maps the optional module parameter to a heading and an explicit Phase A empty state. Unknown module values show a safe not-found state.

- [ ] **Step 6: Run selector/navigation tests and confirm GREEN**

Run: `npm test -- --run src/pages/WorkspaceSelector.test.tsx src/lib/workspaceNavigation.test.ts`

Expected: PASS.

- [ ] **Step 7: Run accessibility-oriented static assertions**

Assert rendered selector/shell markup includes a single main heading, navigation landmark, visible workspace names, links rather than click-only divs, and no raw workspace UUID as customer-facing copy.

- [ ] **Step 8: Commit the workspace UI**

After impact analysis for `Layout` and GitNexus change detection:

```bash
git add src/pages/WorkspaceSelector.tsx src/pages/WorkspaceSelector.test.tsx src/pages/SalesWorkspacePage.tsx src/lib/workspaceNavigation.ts src/lib/workspaceNavigation.test.ts src/components/Layout.tsx src/styles/index.css
git commit -m "feat: add workspace selector and CRM shell"
```

### Task 5: Integrate workspace routes and preserve legacy flows

**Files:**
- Create: `src/lib/appRoutes.ts`
- Create: `src/lib/appRoutes.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/pages/UploadedFileDetail.tsx`
- Modify: `src/components/HistoryBackLink.tsx` only if its fallback contract cannot accept workspace-prefixed paths unchanged.

**Interfaces:**
- Consumes: `ProtectedRoute`, `WorkspaceRoute`, `Layout`, selector and existing legacy pages.
- Produces: authenticated selector landing, nested legacy/Sales routes, and `legacyPath(workspaceId, suffix)` for internal legacy links.

- [ ] **Step 1: Write failing route contract tests**

Test pure route builders:

```ts
expect(legacyPath('legacy-id')).toBe('/w/legacy-id/legacy');
expect(legacyPath('legacy-id', 'company/company-id')).toBe('/w/legacy-id/legacy/company/company-id');
expect(salesPath('sales-id', 'email-campaigns')).toBe('/w/sales-id/sales/email-campaigns');
expect(authenticatedLandingPath()).toBe('/workspaces');
```

Also read `src/App.tsx` and assert the selector, guarded legacy area, guarded Sales area, and flat-route redirect contracts appear.

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm test -- --run src/lib/appRoutes.test.ts`

Expected: FAIL because route helpers and new route contracts do not exist.

- [ ] **Step 3: Implement route helpers**

Normalize suffixes by stripping leading slashes and reject `..` segments. Export exact builders for legacy and Sales routes plus the selector landing path.

- [ ] **Step 4: Replace flat authenticated routes**

After fresh impact analysis for `App`, add:

- `/workspaces` inside `ProtectedRoute`.
- `/w/:workspaceId/legacy` and all current child capabilities inside `WorkspaceRoute area="legacy"` and `Layout area="legacy"`.
- `/w/:workspaceId/sales` plus `/:module` inside `WorkspaceRoute area="sales"` and `Layout area="sales"`.
- `/` and old flat authenticated routes as redirects to `/workspaces`.
- Existing public authentication/callback routes unchanged.

Update workspace-sensitive links such as uploaded-file company targets and back fallbacks to use the active workspace ID. Do not modify HubSpot data queries.

- [ ] **Step 5: Run route and regression tests**

Run:

```bash
npm test -- --run src/lib/appRoutes.test.ts src/lib/returnNavigation.test.ts src/lib/authCallback.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit route integration**

After GitNexus change detection:

```bash
git add src/lib/appRoutes.ts src/lib/appRoutes.test.ts src/App.tsx src/pages/UploadedFileDetail.tsx src/components/HistoryBackLink.tsx
git commit -m "feat: route authenticated users through workspaces"
```

### Task 6: Full verification, rendered smoke test, and handoff

**Files:**
- Create: `docs/development/WORKSPACE_FOUNDATION_HANDOFF.md`
- Modify: only files required to fix failures demonstrated by the verification commands, with a failing regression test first.

**Interfaces:**
- Consumes: complete Phase A branch.
- Produces: verified Phase A evidence and exact deployment/manual follow-up state.

- [x] **Step 1: Run the complete automated suite**

Run separately and preserve exact output:

```bash
npm test -- --run
npm run typecheck
npm run lint
npm run build
```

Expected: all PASS with no omitted failures.

- [x] **Step 2: Run Supabase checks**

Run CLI help before commands whose installed syntax may vary, then run available migration/database lint and `npx supabase test db`. If Docker/linkage prevents live checks, record the exact command and blocker. Do not claim the hosted migration is applied.

- [x] **Step 3: Run rendered browser smoke checks**

Start the Vite application and inspect actual desktop and mobile screenshots for login, selector, Sales shell, and Legacy shell using a test session if available. Verify keyboard-visible controls, horizontal overflow, workspace switcher reachability, route mismatch handling, and console errors. Do not claim authenticated pages were checked if no authenticated session is available.

- [x] **Step 4: Review security and data scope**

Confirm the frontend receives no service/R2 secrets, no legacy business table gained `workspace_id`, no service-role function was broadened, and the migration grants authenticated users read-only workspace metadata.

- [x] **Step 5: Write the handoff**

Record branch, commits, files/schema, environment or dashboard requirements, exact test results, browser evidence, deployment status, blockers, and the first Phase B action. State clearly that migration/deployment is unverified unless direct remote evidence exists.

- [x] **Step 6: Final GitNexus and diff review**

Run `gitnexus_detect_changes(scope: "compare", base_ref: "QuotePulse-CRM/main")`, inspect `git diff --check`, `git status`, and the complete branch diff. Resolve only Phase A issues.

- [x] **Step 7: Commit the verified handoff**

```bash
git add docs/development/WORKSPACE_FOUNDATION_HANDOFF.md
git commit -m "docs: hand off workspace foundation"
```
