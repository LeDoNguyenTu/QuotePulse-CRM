# Storage, archive, and authentication reliability handoff

Updated: 2026-10-07 (Asia/Singapore)

## Release context

- Repository: `LeDoNguyenTu/QuotePulse-CRM`
- Base branch: `main`
- Feature branch: `feat/storage-auth-reliability`
- Base commit: `17596bed52f71e23183c92a4fda75fde0ea45968` (merged PR #32)
- PR #32 Supabase workflow: run `37503250290`, successful. Migration application, Edge Function deployment, transactional database checks, automatic storage recovery, and the archive schedule all passed.

## Implemented in this branch

### Sales CRM storage visibility

- The Sales CRM dashboard reuses `StorageStatusPanel` to show Supabase database and Cloudflare R2 usage percentages.
- The existing refresh, automatic archive, and recovery summaries remain intact.

### Legacy archive progress

- `useWorkspaceArchive` now reads the member-visible `workspace_archive_tables` progress rows for the latest archive.
- The panel reports in-progress row and verified-object totals plus the current table instead of showing zero until the final manifest is complete.
- Archive and restore actions remain explicitly user-triggered and bounded to one step. No automatic deletion was added.

### Password and email-link flows

- Signed-in password changes use Supabase's supported `current_password` field in the same `updateUser` request as the replacement password.
- Both legacy and Sales CRM Settings show password requirements beside the fields, report mismatch inline, disable invalid submission, and visually separate the password action from integration/delivery/session settings.
- Forgot-password emails redirect to `/auth/reset-password`.
- The dedicated reset page handles token-hash and implicit recovery links, invalid/expired links, password confirmation, successful reset, sign-out, and return to sign-in.
- A bare reset URL cannot change a password, even if the browser already has an unrelated signed-in session.
- The login page displays a successful-reset notice when returning from the recovery flow.

## Verification completed before commit

```text
npm test -- --run
150 test files passed; 549 tests passed

npm run typecheck
passed

npm run lint
passed

npm run build
passed; existing bundle-size warning only
```

The password reset regression test was observed failing before the page existed, then passing after implementation. The archive progress query was checked against migration `20260929053000_phase_i_legacy_workspace_archive.sql`, including its authenticated member-select RLS policy.

## Operational follow-up after merge

1. Confirm the exact merge SHA's GitHub quality and Supabase workflows.
2. Confirm Vercel production is READY for that SHA.
3. In an authenticated browser, verify the Sales CRM dashboard shows both storage percentages and Settings shows the clarified buttons and inline password guidance.
4. Open `/auth/reset-password` without a token and confirm the invalid/expired state. Do not submit a real password change during automated verification.
5. Confirm the Supabase Auth redirect allow-list includes `https://quote-pulse-crm.vercel.app/auth/reset-password`. The application supplies this redirect, but dashboard allow-list state is external to the repository.

## Tooling

- Vercel CLI `62.5.0` is installed globally and authenticated as the current Vercel user.
- `vercel project inspect quote-pulse-crm --scope itsbrian` resolves project `prj_NezMtWFkbQpytv32aaeYllJxEoqG` with `dist` output and Node.js 24.x.
