# UI Safety and Archive Parity Handoff

Date: 2026-10-09

Branch: `feat/contact-action-menu`

Base: `main` at `6acae6400b1279e1ecc88ab0590e72d7b0d758ff`

## Delivered

- Contacts use a compact primary Edit action plus a self-closing More menu for lifecycle and destructive actions.
- Outreach and Tools are distinct controlled menus that close on outside click, Escape, route selection, or opening the sibling menu.
- Settings show compact feedback and a simple Save changes action. Settings, campaign drafts, and template edits warn before unsaved work is discarded by navigation or reload.
- The Legacy dashboard automatically opens a verified R2 archive when the Supabase copy is deleted or empty. Companies, Deals, and Contacts remain searchable and paged in a read-only ledger; a record must be selectively restored before it can be edited.
- Archive reads retain the existing owner check, signed cursor, table allow-list, R2 pointer validation, checksum verification, and selective restore boundary. This release does not broaden the archive browse allow-list or restore customer data during verification.

## Local verification

- `npm test -- --run`: 177 files passed, 1 skipped; 632 tests passed, 9 skipped.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed. Vite reported the existing browser-polyfill and large-chunk advisories only.
- GitNexus staged detection: HIGH for the shared settings/template/campaign and Dashboard orchestration surfaces; the focused symbol impacts were LOW, and those paths are mandatory in the independent review and authenticated smoke test.
- Fresh independent review approved exact code SHA `9975e65ccd65c89ac945776474f58e86e56b446d` with no remaining blocking or Important findings.

## Release evidence

- Commits: `d371bcc`, `b57ce0d`, `8c0194e`, `f2983a0`, `b2aa4fe`, `9975e65`.
- Pull request: pending.
- Merged SHA: pending.
- Supabase workflow: pending for the merged SHA.
- Vercel production deployment: pending for the merged SHA.
- Authenticated production smoke: pending.

## Recovery and continuation

- All source/import history and verified archive objects remain unchanged by this UI release.
- Archived rows stay in R2. Selecting **Restore to edit** presents the existing warning and restores only that record into Supabase; ordinary archive browsing never restores or mutates rows.
- If release verification fails, use this document with the PR and exact merged SHA above; do not delete the verified R2 archive as a rollback step.
