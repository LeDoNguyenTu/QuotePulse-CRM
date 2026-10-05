# Post-merge CRM regressions — continuation handoff

Updated: 2026-10-06 (Asia/Singapore)

## Starting state

- PR [#28](https://github.com/LeDoNguyenTu/QuotePulse-CRM/pull/28) merged to `main` as `ae30f988e2f50dabaab6e4abb789b95246b79955` on 2026-10-05.
- Vercel reported a successful deployment for that exact merge SHA.
- The exact-SHA GitHub Actions run [37335514987](https://github.com/LeDoNguyenTu/QuotePulse-CRM/actions/runs/37335514987) failed in the Supabase deployment workflow.
- Repair branch: `fix/post-merge-crm-regressions`, based on `ae30f98`.
- Repair pull request: [#29 — fix: repair post-merge CRM regressions](https://github.com/LeDoNguyenTu/QuotePulse-CRM/pull/29). It is intentionally left open with `REVIEW_REQUIRED`; the first Vercel preview check succeeded.

## Confirmed problems and repairs

### Narrow Deals toolbar clipping

The shared CRM filter bar was a non-wrapping flex row. The search element used a zero flex basis while the Columns control and filter selects had fixed minimum widths. In a narrow content pane inside a browser wider than the `767px` media breakpoint, the fixed controls overflowed and were clipped.

Repair:

- `.crm-filter-bar` now wraps.
- The search element has an explicit class and a `flex: 1 1 16rem` basis.
- The change intentionally applies to Companies, Contacts, and Deals because all three use `CrmFilterBar`.
- A real browser harness at a `232px` content width showed all four Deals controls completely visible on wrapped rows. The temporary harness was deleted after verification.

### Supabase exact-SHA workflow failure

The workflow applied migrations `20261004121739` and `20261005022000`, then deployed its configured Edge Functions. Its database test failed with PostgreSQL `42725`: `crm_add_activity_with_destination(...) is not unique`.

Root cause:

- Migration `20260930233540` created the original 15-argument activity-destination function.
- Migration `20261004121739` added a 16-argument overload whose final `p_call_outcome` parameter has a default.
- The new function called the old function with 15 positional arguments. PostgreSQL could match either overload, so both the database test and live activity creation could fail ambiguously.

Repair:

- Forward migration `20261006013000_remove_activity_destination_overload.sql` replaces the 16-argument function with the complete implementation, including membership/lineage validation, task linkage, source destination, call outcome, and deal update behavior.
- The forward migration then drops the obsolete 15-argument overload and reapplies the authenticated-only grant to the remaining function.
- Historical applied migrations are not edited.

### CRM export function omitted from deployment

`export-crm-records` existed in `supabase/config.toml` and was called by the frontend, but it was absent from the explicit function loop in `.github/workflows/supabase.yml`. The merge-SHA run therefore never deployed it.

Repair:

- The workflow now includes `export-crm-records` immediately after `export-xlsx`.
- A regression test checks the actual deployment loop.

## Verification evidence

- Clean merged baseline before repairs: 140 test files / 525 tests passed.
- TDD red/green evidence captured for toolbar wrapping, overload removal, and workflow function inclusion.
- Focused repair suite: 4 files / 7 tests passed.
- Final integrated pass: 143 test files / 528 tests passed; lint, typecheck, and production build passed.

Local SQL execution is unavailable on this machine, so the forward migration still requires the repository's exact-SHA Supabase workflow as its real database proof.

## Release gates

1. Commit only the repair files and this handoff; exclude GitNexus-generated `AGENTS.md`, `CLAUDE.md`, and `.claude/skills/gitnexus/**` noise.
2. Push `fix/post-merge-crm-regressions` and open a PR against `main`.
3. Do not bypass the required review gate.
4. After merge, verify that the exact merge-SHA Supabase run:
   - applies migration `20261006013000`;
   - deploys `export-crm-records`;
   - passes `supabase/tests/crm_activity_export_destinations.sql` and every following database test.
5. Verify the exact merge-SHA Vercel production deployment, then inspect the authenticated Deals, Companies, and Contacts filter bars at the reported narrow layout.
6. Exercise one authenticated activity creation with and without a call outcome, plus one selected-column CRM export, before declaring production acceptance.
