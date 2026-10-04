# CRM workflow upgrades — continuation handoff

Updated: 2026-10-05 (Asia/Singapore)

## Start here

- Branch: `feat/client-crm-workflow-upgrades`
- The implementation head before this handoff document: `136f29c` (`fix: make password changes verifiable`)
- Design: [`2026-10-04-client-crm-workflow-upgrades-design.md`](../superpowers/specs/2026-10-04-client-crm-workflow-upgrades-design.md)
- Execution plan: [`2026-10-04-client-crm-workflow-upgrades.md`](../superpowers/plans/2026-10-04-client-crm-workflow-upgrades.md)
- Repository: `LeDoNguyenTu/QuotePulse-CRM`; deploy branch is `main`.

This is a feature branch. It has not been merged or deployed while writing this handoff. Do not represent any feature below as live until the exact merge-SHA Supabase workflow and Vercel deployment have both been checked.

## What is implemented

| Area | Delivered behavior | Key commit |
| --- | --- | --- |
| Workbook imports | Repeat uploads reconcile records and preserve import provenance. | `7e30c85` |
| Workspace branding | Removed tenant/company artwork from workspace selection and compact branding. Workspace names remain; neutral database icons use different colours. | `baf0d57` |
| Contacts | Exact normalized name-and-phone matches flag a duplicate review and mark only the older, unverified record `outdated`; nothing is automatically hidden. Users can verify, mark outdated, hide/show, resolve review, and bulk-hide outdated rows. Role/state/visibility/review filters and table columns are included. | `096be49` |
| Deals and customer status | Deal stage, appointment status, and call outcome remain separate. Deals and companies support configurable visible columns. Companies have customer status: Current Customer, Prospect, Former Customer, Maintenance Customer, or custom tag. | `262bc43` |
| Activities | Notes/activity timeline entries can be edited with an audit trail. Company activity includes last-contact/follow-up/call-outcome/call-log fields and most-recent activity. | `efd3bf5` |
| Export | Companies, contacts, and deals offer row selection, all-matching export, CSV/XLSX, and per-export column selection. The `export-crm-records` Edge Function scopes every read to the authenticated member and workspace, caps exports at 5,000 rows, and neutralizes formula-like cells. | `15b804d` |
| Tasks | A global reminder center materializes due-soon notifications, shows a session-aware pop-up, and supports 15-minute snooze/dismiss. It reuses the existing notification materializer instead of adding another scheduler. | `2d1434c` |
| Email templates | HTML table email import accepts `.htm`/`.html` plus a companion ZIP or selected images, sanitizes active content, uploads only image assets, rewrites image references, provides a sandboxed preview, stores a text fallback, and sends HTML plus plain text through Graph/Brevo. | `7f0db24` |
| Password change | Both Settings experiences use current-password reauthentication followed by the provider update, validate the new password locally, and only clear fields after success. | `136f29c` |

## Customer-file evidence

The supplied `D:\PROJECTS\Customer files` material was inspected during implementation.

- `Free 30-Day Trial of Microsoft 365 Copilot for Business.htm.html` contained 12 tables and 7 image references.
- `Free 30-Day Trial of Microsoft 365 Copilot for Business_files.zip` contained the corresponding seven image assets.
- The import transformation test preserved all 12 tables, resolved all 7 image references, and found no unresolved paths.
- Direct `.msg` parsing is intentionally not implemented. The supported workflow is HTML plus its companion ZIP/images, which matches the provided formatted-email assets.

Images must be externally reachable for email clients to render them. The implementation limits uploads to PNG/JPEG/GIF/WebP, has per-file and total upload limits, hashes assets, uses owner-prefixed storage paths, and has owner-only upload/write rules. Review the public asset-bucket policy before changing that design.

## Database and function changes awaiting deployment

The following are committed but require the repository's Supabase deploy workflow after merge to `main`:

- `supabase/migrations/20261004121739_client_crm_workflow_upgrades.sql`
- `supabase/migrations/20261005022000_rich_email_templates.sql`
- `supabase/functions/export-crm-records/index.ts`

The migration list could not be checked from this machine because the installed Supabase CLI failed while parsing the local `.env` file (`DbConfigLoadError`). Do not edit or expose secrets merely to work around that error; repair the local environment-file syntax or use an approved CI/CLI environment, then compare the remote migration list before declaring the backend released.

## Local verification completed

On the final implementation commit:

```text
npm test -- --run  -> 264 test files / 984 tests passed
npm run lint       -> passed
npm run typecheck  -> passed
npm run build      -> passed
```

The production build still emits Vite's large JavaScript chunk advisory (about 792 kB after minification). It does not fail the build and should be handled as a separate performance task rather than mixed into this feature release.

## Tooling and live-state facts

- Vercel CLI is installed and authenticated as `ledonguyentu` (`vercel --version` returned `62.2.0`).
- `vercel project inspect quote-pulse-crm --scope itsbrian` identified `itsbrian/quote-pulse-crm` (`prj_NezMtWFkbQpytv32aaeYllJxEoqG`). The local folder was intentionally not linked, and no deployment or environment pull was performed.
- Microsoft Graph supports MIME message sending, and Brevo documents both `htmlContent` and `textContent`. The code keeps the existing provider selection rather than introducing a new mail provider.
- There has been no authenticated end-to-end browser test, real outbound email, or successful password re-login because no safe test account credentials were supplied. There is therefore no production acceptance evidence for those flows yet.

## Resume / release sequence

1. Check out this branch, pull its remote, read this file, then run `npx gitnexus analyze` before editing application symbols.
2. Review the pull request and its checks. Merge only after required reviews/checks pass.
3. After merge, watch the exact `main`-SHA Supabase workflow: both migrations must apply and `export-crm-records` must deploy.
4. Verify the exact `main`-SHA Vercel deployment. The Vercel project is known but this checkout is not linked.
5. In an authenticated test workspace, smoke-test: duplicate review/older-outdated behavior; individual and bulk hiding; selected/all-matching export; column preference persistence; activity edits; task pop-up/snooze/dismiss; HTML email import/preview and a controlled provider send; and password change followed by a fresh sign-in.
6. Record the migration, function deployment, Vercel URL, and authenticated test evidence in a new continuation note before calling the work production-ready.

## Commit map

```text
df64acd docs: design client CRM workflow upgrades
c06d392 docs: plan client CRM workflow upgrades
1384618 feat: add CRM workflow data contract
7e30c85 feat: reconcile repeated CRM workbook imports
baf0d57 feat: simplify workspace branding and table controls
096be49 feat: add contact lifecycle review workflow
262bc43 feat: add deal outcomes and customer status
efd3bf5 feat: support editable CRM activity timelines
15b804d feat: add configurable CRM record exports
2d1434c feat: add global CRM task reminders
7f0db24 feat: add rich HTML email templates
136f29c fix: make password changes verifiable
```
