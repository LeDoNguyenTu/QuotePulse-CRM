# Sales CRM relational foundation handoff

Date: 2026-09-28

## Delivered

- Added nine workspace-scoped relational tables for companies, contacts, deals,
  deal contacts, activities, tasks, notifications, source imports, and source
  references.
- Added explicit Data API grants, row-level security, composite workspace
  foreign keys, audit protection, role-gated deletion, and focused list/search
  indexes.
- Added typed CRM inputs, normalization, deterministic pagination, query keys,
  and workspace-scoped TanStack Query hooks.
- Replaced the Sales CRM placeholders with a dashboard and responsive Companies,
  Contacts, and Deals ledgers.
- Added create/edit forms, association selectors, status filtering, safe delete
  confirmation, page recovery after final-row deletion, and owner/admin-only
  delete controls.
- Kept all legacy HubSpot tables and workflows unchanged.

## Schema and deployment

Migration:

- `supabase/migrations/20260928203000_sales_crm_relational_foundation.sql`

Executable database isolation contract:

- `supabase/tests/sales_crm_isolation.sql`

The migration is not considered deployed until the branch is merged and the
Supabase GitHub Actions job succeeds. No new environment variables or secrets
are required. Frontend deployment remains the existing Vercel deployment from
`main`.

## Verification evidence

Fresh branch checks before publication:

- `npm test -- --run`: 68 files passed, 296 tests passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed; Vite reported the non-blocking 629.42 kB main-chunk
  size warning.
- `git diff --check main...HEAD`: passed after correcting four Markdown
  trailing-space findings.
- Authenticated production Chrome inspection: confirmed the real Sales CRM
  workspace shell, workspace switcher, navigation, and logged-in session.
  Phase B CRUD was not yet deployed at inspection time and was not represented
  as production-tested.

Local executable Supabase checks are blocked before database startup:

- `npx supabase db lint --local`: `DbConfigLoadError` because the repository's
  existing private `.env` cannot be parsed by Supabase CLI 2.118.0.
- `npx supabase test db`: same `DbConfigLoadError`.

The private `.env` was not read, rewritten, or committed. Migration structure
is covered by five passing contract tests, but those tests do not replace the
post-merge real database isolation run.

## Operational acceptance after merge

1. Confirm the Supabase workflow applies migration version `20260928203000`.
2. Confirm the Vercel production deployment corresponds to the merge SHA.
3. In an authenticated Sales CRM workspace, create and edit one company, one
   associated contact, and one associated deal.
4. Verify search, status filtering, pagination, member delete visibility, and
   owner/admin deletion behavior.
5. Verify a second workspace cannot read or associate the first workspace's
   identifiers using the SQL isolation contract or an equivalent controlled
   integration test.

## Next phase

Phase C should reuse the existing uploaded-files parser and column-mapping UI,
then commit normalized company/contact/deal rows through a bounded import
preview. Populate `crm_source_imports` and `crm_source_references`, expose the
stable Database ID and source filename, and keep raw workbook payloads out of
Postgres after reconciliation.
