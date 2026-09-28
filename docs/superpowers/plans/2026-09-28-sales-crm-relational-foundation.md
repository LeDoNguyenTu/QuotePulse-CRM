# Sales CRM relational foundation implementation plan

> Execute task-by-task with TDD, GitNexus impact checks before existing-symbol
> edits, change detection before commits, and fresh verification at handoff.

**Goal:** Deliver workspace-isolated, paginated CRUD for Sales CRM companies,
contacts, and deals plus the relational foundations for later CRM phases.

**Base:** `main` at merge commit `5a9758c`
**Branch:** `feature/sales-crm-relational-foundation`
**Design:** `docs/superpowers/specs/2026-09-28-sales-crm-relational-foundation-design.md`

## Task 1: Schema, RLS, and executable isolation contract

Create:

- `supabase/migrations/20260928203000_sales_crm_relational_foundation.sql`
- `supabase/migrations/20260928203000_sales_crm_relational_foundation.test.ts`
- `supabase/tests/sales_crm_isolation.sql`

Steps:

1. Write failing structural tests for the nine `crm_` tables, explicit grants,
   per-operation policies, composite workspace foreign keys, and indexes.
2. Add the imperative migration with primary records, future-phase foundation
   records, checks, audit fields, triggers, and workspace-aware constraints.
3. Add the executable two-workspace SQL transaction for CRUD and isolation.
4. Run the focused Vitest migration contract. Attempt Supabase DB lint/test;
   preserve exact environment blockers.
5. Run GitNexus change detection and commit as
   `feat(db): add Sales CRM relational foundation`.

## Task 2: Typed CRM domain and pagination contracts

Create:

- `src/lib/crm/types.ts`
- `src/lib/crm/inputs.ts`
- `src/lib/crm/inputs.test.ts`
- `src/lib/crm/pagination.ts`
- `src/lib/crm/pagination.test.ts`
- `src/lib/crm/queryKeys.ts`
- `src/lib/crm/queryKeys.test.ts`

Steps:

1. Write failing tests for page ranges, workspace-scoped keys, optional-value
   normalization, currency/domain normalization, and validation errors.
2. Implement narrow types and pure helpers; do not reuse legacy HubSpot types.
3. Run focused tests and typecheck.
4. Detect changes and commit as `feat: add typed Sales CRM contracts`.

## Task 3: Workspace-scoped CRUD hooks

Create:

- `src/hooks/crm/useCrmCompanies.ts`
- `src/hooks/crm/useCrmContacts.ts`
- `src/hooks/crm/useCrmDeals.ts`
- `src/lib/crm/resources.ts`
- `src/lib/crm/resources.test.ts`

Steps:

1. Write failing tests for exact table names, nested association selects,
   deterministic ordering, search filters, and workspace predicates.
2. Implement paginated list/count queries and create/update/delete mutations.
3. Ensure audit IDs come from the authenticated session and mutation payloads
   cannot override workspace identity.
4. Run focused tests and typecheck.
5. Detect changes and commit as `feat: add Sales CRM data access`.

## Task 4: Reusable list and editor UI

Create:

- `src/components/crm/CrmPageHeader.tsx`
- `src/components/crm/CrmPagination.tsx`
- `src/components/crm/CrmResourceState.tsx`
- `src/components/crm/CompanyEditor.tsx`
- `src/components/crm/ContactEditor.tsx`
- `src/components/crm/DealEditor.tsx`
- focused render/unit tests beside pure form helpers

Steps:

1. Write failing tests for page boundaries, labels, normalized submissions, and
   owner/admin delete visibility.
2. Implement accessible reusable controls and resource-specific editors.
3. Run focused tests, typecheck, and lint.
4. Detect changes and commit as `feat: add Sales CRM editing controls`.

## Task 5: Companies, contacts, deals, and dashboard pages

Create:

- `src/pages/crm/CrmDashboard.tsx`
- `src/pages/crm/CrmCompanies.tsx`
- `src/pages/crm/CrmContacts.tsx`
- `src/pages/crm/CrmDeals.tsx`
- `src/pages/crm/CrmResourcePages.test.tsx`

Modify:

- `src/pages/SalesWorkspacePage.tsx`

Steps:

1. Run GitNexus impact for `SalesWorkspacePage` and report the blast radius.
2. Write failing page/router tests for the four real modules and placeholder
   fallback for later modules.
3. Build the paginated list/create/edit/delete flows using the active workspace.
4. Preserve direct URL navigation and the existing shell/navigation contract.
5. Run focused tests, typecheck, lint, and a production build.
6. Detect changes and commit as `feat: deliver Sales CRM core pages`.

## Task 6: Integrated verification and handoff

Create:

- `docs/development/SALES_CRM_RELATIONAL_FOUNDATION_HANDOFF.md`

Steps:

1. Run `npm test -- --run`, `npm run typecheck`, `npm run lint`, and
   `npm run build` separately and record exact results.
2. Run available Supabase lint/database tests and record exact blockers.
3. Inspect actual desktop/mobile rendering with an authenticated test session
   if available; never claim authenticated acceptance otherwise.
4. Review secrets, grants, RLS, composite foreign keys, query pagination, and
   service-role boundaries.
5. Run GitNexus compare analysis, diff checks, and a whole-branch review.
6. Write the handoff with migration/deployment status and first Phase C action.
7. Commit as `docs: hand off Sales CRM relational foundation`, push the branch,
   open a PR, and stop before merge unless the user has separately authorized
   merging that later PR.
