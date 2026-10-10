# Legacy company ledger handoff

## Outcome

The Legacy workspace now presents the Cloudflare R2 archive as one company-centred ledger. Each company expands inline to show its archived contacts and deals, so relationship context is never separated across object tabs. Archived records remain read-only until the user confirms a selective restore.

The Sales CRM workspace is unchanged.

## Architecture and safety

- Customer rows remain in R2; Postgres stores only a compact relationship Bloom index on verified archive-object metadata.
- Relationship indexing is owner/workspace/archive scoped, checksum verified, idempotent, resumable, and bounded to 20 objects per Edge invocation.
- Bloom matches only narrow the candidate set. Exact `company_id` matching is performed against the verified R2 payload before any contact or deal is displayed.
- Missing, malformed, or future-version Bloom metadata fails open to an R2 read, preventing false omissions.
- Company, contact, and deal restore cursors are independently signed for the correct table.
- Restore preserves the archive and invalidates the relevant live and archive query caches.

## User experience

- Company search, configurable company columns, and cursor paging remain available.
- The disconnected archived Companies, Deals, and Contacts tabs are removed.
- `View linked records` expands Contacts and Deals directly beneath the company row.
- Empty Contacts and Deals sections are explicit.
- Each parent or child row has `Restore to edit`; the existing warning explains that R2 is read-only before restoration.
- Relationship-index progress is visible on the first expansion while an older archive is prepared.

## Verification

- Focused component/hook/backend/migration tests: passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed (existing bundle-size advisory only).
- Full Vitest suite: 183 files / 657 tests passed; 1 file / 9 tests intentionally skipped.
- GitNexus change detection: MEDIUM, limited to expected legacy archive/auth/cache flows.
- Independent whole-branch review: no remaining Critical or Important findings after two findings were fixed with red-to-green tests.

Review fixes retained RLS-scoped authenticated metadata reads needed by archive progress, while continuing to deny browser mutation. Bloom bytes are HMAC-authenticated together with archive, workspace, owner, table, sequence, and verified R2 checksum context; malformed, corrupted, swapped, or stale metadata fails open to exact R2 verification.

## Release

- Feature branch: `feat/legacy-company-ledger` (merged and remote branch deleted)
- Commits: `319853d`, `5a0bcdf`, `09c2c2c`, `2959e1f`
- PR: `#58` — merged
- Merge SHA: `8413dfaf1573ecddb80cf9ab3f75751ea56389df`
- Supabase workflow: run `37998299763` passed for the exact merge SHA, including quality checks, migration apply, Edge Function deployment, transactional database security/performance tests, recovery controller, and archive schedule verification.
- Vercel production: deployment `dpl_GMx9XNQKgZerpAvoMSjh1ogxJh2r` is `READY` and aliased to `https://quote-pulse-crm.vercel.app`; GitHub's Vercel status for the exact merge SHA points to this deployment.
- Public production probe: HTTP 200, and the deployed bundle contains the company-ledger copy, `View linked records`, and `Restore to edit` controls.
- Authenticated production smoke: pending because the retained Chrome session expired to `/login`. Do not claim the relationship index or rendered child rows are production-verified until the user signs in again.

The first full-suite attempt exposed an incomplete `node_modules` directory in the feature worktree (the declared PST parser package was absent). `npm install` restored the lockfile-defined dependency and applied the existing compatibility patch; the unchanged suite then passed completely.

## Production acceptance

After deployment, open the Legacy workspace R2 archive and confirm:

1. There is one company ledger and no separate archived object tabs.
2. Expanding a company shows only contacts and deals whose exact archived `company_id` matches it.
3. Empty linked sections are clearly stated.
4. Company, contact, and deal rows each show the read-only restore warning before mutation.
5. Search, columns, paging, light theme, and dark theme remain usable.

Operational smoke should include a relationship-heavy company because child projections preserve archived HubSpot properties for fidelity and can therefore be larger than ordinary rows.

Current continuation point: sign in to QuotePulse in Chrome, open the Legacy workspace archive, complete the five acceptance checks above, then leave Sales Contacts open. No code or deployment work is otherwise pending.
