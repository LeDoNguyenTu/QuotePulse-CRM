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

## Verified production release

- PR #33 merged as `acb803a671d1e2a9817714e6588fc32b4ae70ab0`.
- PR #34 merged as `7200ada6de273338566de461de0871e573a091c8` for the legacy Settings consistency follow-up.
- GitHub/Supabase runs `37505679209` and `37506588329` completed successfully, including migrations, Edge Functions, transactional database checks, recovery controller enablement, and archive schedule verification.
- Vercel deployments `dpl_ER4KG4cv4wwpiWMhhnEvhUisWPnC` and `dpl_Aa9PgA6Td39gziNFSHucCCW7LeG4` reached READY and the public alias was updated.
- Authenticated production rendering confirmed the Sales CRM dashboard percentages, both Settings variants, the tokenless expired/invalid reset state, and legacy archive progress of 4,500 rows / 18 verified objects on `companies`.

The storage card's September lease-timeout message is historical material-work history, not the current scheduler state. Read-only production evidence on 2026-10-07 showed the minute cron active with recent HTTP 200 responses (`idle` on ordinary minutes and `succeeded` on five-minute warning-pressure work intervals), no active archive lease, and no current error. The UI now labels this as the latest recorded archive work and explains that automatic retries continue, instead of presenting it as the live scheduler state.
