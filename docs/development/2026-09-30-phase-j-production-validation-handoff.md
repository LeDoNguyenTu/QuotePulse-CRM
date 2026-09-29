# Phase J production validation handoff

## Scope and implementation

- Branch: `feature/production-hardening`
- Implementation commit: `23b5a22`
- Upgraded React Router, Vite, Vitest, and related build dependencies; `npm audit` reports zero vulnerabilities.
- Workbook ingestion now rejects empty, renamed non-ZIP, encrypted, ZIP64, excessive-entry, and over-100-MiB-expanded OOXML containers while retaining the 25 MiB upload cap.
- The supplied `Leads Database - testing.xlsx` passed the new container validation at 281,664 bytes.
- XLSX export neutralizes formula-like user text and no longer returns raw internal exception messages.
- Password changes reauthenticate the current email/password before submitting the supported new-password payload.
- Added query-matched Sales CRM timeline, task, notification, PST metadata, subject-search, and campaign indexes.
- Added a transactional production database posture test for RLS, anonymous grants, policies, indexes, and security-definer search paths.
- The deploy workflow now includes `workspace-archive`, uses Node.js 24, and runs the transactional SQL security/performance suite after migrations and function deployment.

## Verification completed locally

- `npm test -- --run`: 92 files, 368 tests passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed on Vite 8.3.1; the existing main-bundle size warning remains.
- `npm audit --audit-level=moderate`: zero vulnerabilities.
- `npx deno check --node-modules-dir=auto` passed for `export-xlsx` and `workspace-archive`; `npm ci` was rerun afterward to restore the patched npm dependency tree.
- GitNexus change detection reported high risk in the expected shared auth and workbook flows; focused and complete tests passed.

## Production gates still required

1. Push this branch, open the Phase J PR, and wait for the Vercel preview.
2. Merge only after PR checks pass.
3. Wait for the exact-main-SHA Supabase workflow. It must apply migration `20260929114500`, deploy `workspace-archive`, and pass every linked transactional SQL test.
4. Verify the exact-main-SHA Vercel production deployment.
5. Run an authenticated browser smoke across workspace selection, Sales CRM lists/details, Imports, PST Extractor, Settings archive controls, and a mobile viewport.
6. Do not claim a real R2 archive/restore round trip unless it is actually exercised. Deletion remains dry-run/eligibility only.

## Tooling note

The Vercel CLI is not installed locally. Install it with `npm i -g vercel` to enable direct environment pulls, deployments, and logs; GitHub deployment evidence remains available without it.
