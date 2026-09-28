# Phase D — Sales CRM record details handoff

## Scope delivered

- Company, contact, and deal record routes under
  `/w/:workspaceId/sales/:module/:recordId`.
- Workspace-scoped detail queries for each primary record, its directly linked
  records, and workbook source references.
- Responsive company, contact, and deal detail views with audit dates,
  associations, pipeline facts, and visible Database ID / filename / worksheet /
  source-row lineage.
- Navigable record names in all three ledgers.
- Company industry and sort controls, contact company and sort controls, and
  deal status/company/sort controls. Existing server-side search and pagination
  remain active.

## Security and data boundaries

- Every detail and association query filters `workspace_id` explicitly; RLS is
  still the independent database control.
- Cross-workspace identifiers render the same unavailable state as deleted
  records.
- Detail queries use relationship selects rather than per-row requests.
- The activity/email panel is intentionally empty until Phase E/G provides a
  workspace-scoped activity/campaign relationship. The legacy `email_sends`
  table is owner-scoped, so joining it only by recipient email would be
  ambiguous across Sales CRM workspaces.

## Commits

- `b5e4ae1` — Sales CRM record routes, detail queries, responsive detail UI, and
  lineage presentation.
- `a45c437` — allow-listed list sorting and workspace-scoped filters.

## Verification

- `npm test -- --run`: 72 files, 313 tests passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed; Vite retained the existing large-chunk advisory.
- GitNexus change detection reported HIGH aggregate routing/query fan-out. The
  touched surfaces are the guarded Sales route dispatcher and the shared CRM
  list query builder; both received full-suite verification.

## Release and next action

Push this branch, open and merge its pull request, wait for the exact merge SHA
to pass Vercel and the Supabase workflow, then inspect the authenticated desktop
and mobile render. Phase E follows with the unified note/call activity model and
chronological company/deal timelines.
