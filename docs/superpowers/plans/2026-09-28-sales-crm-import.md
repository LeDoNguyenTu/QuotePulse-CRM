# Sales CRM workbook import implementation plan

## Task 1: Import contracts and preview engine

- Add Sales-specific mapping roles and normalized row/result types.
- Add tests for mapping validity, row normalization, parsing, and duplicate
  classification.
- Reuse the existing workbook parser without changing its legacy consumers.

## Task 2: Atomic workspace import RPC

- Add a timestamped migration containing bounded JSON validation and the
  workspace-member commit function.
- Insert `crm_source_imports`, reuse/create CRM rows, and insert one source
  reference per affected entity and source row.
- Add migration contract and executable isolation tests.

## Task 3: Data hook and Imports UI

- Add workspace-scoped import history and commit hooks.
- Build worksheet selection, mapping, preview, issue summary, commit result, and
  history with Database ID and source filename.
- Replace the Sales `imports` placeholder without changing legacy uploads.

## Task 4: Integrated verification and release

- Run focused and full tests, typecheck, lint, build, database checks where
  available, GitNexus change detection, and authenticated browser smoke.
- Document deployment evidence and Phase D follow-up, then publish through a PR.
