# Client CRM Workflow Upgrades Implementation Plan

> **For Codex:** Execute this plan task-by-task with `superpowers:executing-plans`. Follow the repository `AGENTS.md`: run GitNexus impact analysis before editing every existing symbol, warn before any HIGH/CRITICAL edit, and run `gitnexus_detect_changes()` before every commit.

**Goal:** Deliver the customer-requested CRM workflow upgrades without replacing the existing workspace, provenance, import, activity, task, campaign, and recovery architecture.

**Architecture:** Extend the existing workspace-scoped CRM tables and RPCs with additive lifecycle, outcome, import-revision, and HTML-template fields. Keep UUIDs authoritative while exposing short display IDs. Put identity matching and tenant enforcement in SQL/RPCs, keep pure parsing/presentation logic in tested TypeScript helpers, and build each UI feature on the existing TanStack Query hooks and CRM components.

**Tech Stack:** React 18, TypeScript, Vite, TanStack Query, Tailwind, Supabase Postgres/Auth/Storage/Edge Functions, Microsoft Graph, Brevo, Vitest, Deno tests, Vercel.

---

## Task 1: Establish the additive database contract

**Files:**
- Create: `supabase/migrations/20261004210000_client_crm_workflow_upgrades.sql`
- Create: `supabase/migrations/20261004210000_client_crm_workflow_upgrades.test.ts`
- Modify: `src/lib/crm/types.ts`
- Modify: `src/lib/types.ts`

**Steps:**

1. Run GitNexus impact analysis for the existing CRM row types and any SQL functions that the migration replaces. Record the affected callers and stop for a user warning if risk is HIGH or CRITICAL.
2. Write a failing migration contract test requiring:
   - `crm_companies.customer_status` and a constrained standard/custom status representation.
   - `crm_contacts.record_state`, `is_hidden`, and `duplicate_review_of`.
   - `crm_deals.call_outcome` and `appointment_status` while preserving `stage`.
   - `crm_activities.call_outcome`, `updated_by`, and `updated_at`.
   - source revision and stable source-row fingerprint fields needed for repeat imports.
   - `email_templates.body_format`, `body_html`, and asset metadata support.
   - workspace-scoped indexes for duplicate review, hidden/outdated filtering, source identity, due notifications, and current activity summaries.
   - RLS/grants, audit triggers, and `security invoker`/fixed `search_path` conventions matching the current schema.
3. Run `npm test -- supabase/migrations/20261004210000_client_crm_workflow_upgrades.test.ts` and confirm the new assertions fail.
4. Create the migration through `npx supabase migration new client_crm_workflow_upgrades`, then use the generated file as the authoritative migration path. If its timestamp differs from `20261004210000`, rename the companion test to the generated timestamp and update later commands in this plan.
5. Implement only additive columns, checks, indexes, trigger updates, and helper functions. Do not delete or rewrite existing customer data. Add a deterministic short-display-ID function that formats UUID-derived IDs as `DB-XXXXXX` without using the display value as a key.
6. Update TypeScript row/input types to expose the new fields without weakening existing types to `any`.
7. Run the focused migration test, `npm run typecheck`, and `git diff --check`.
8. Run `gitnexus_detect_changes()`, review the affected flows, and commit: `feat: add CRM workflow data contract`.

## Task 2: Make workbook re-uploads idempotent and duplicate-safe

**Files:**
- Modify: `src/lib/crm/importPreview.ts`
- Modify: `src/lib/crm/importPreview.test.ts`
- Modify: `src/lib/crm/importDraft.ts`
- Modify: `src/lib/crm/importDraft.test.ts`
- Modify: `src/lib/crm/workbookRoundTrip.ts`
- Modify: `src/lib/crm/workbookRoundTrip.test.ts`
- Modify: `src/hooks/crm/useCrmImports.ts`
- Modify: `supabase/migrations/20261004210000_client_crm_workflow_upgrades.sql`
- Modify: `supabase/migrations/20261004210000_client_crm_workflow_upgrades.test.ts`

**Steps:**

1. Run GitNexus impact analysis for `buildImportPreview`, the import draft builder, `crm_commit_import_with_activities`, and the workbook round-trip mapper before editing.
2. Add failing tests with representative headers from the supplied NAV, Telemarketing Pipeline, Customer Contacts, Current AMC, and Support Customers workbooks. Cover `Designation`, last/follow-up dates, call outcome/log, appointment status, customer status, active/inactive sheets, and multiple contact columns.
3. Add failing identity tests proving:
   - a re-upload of the same workbook/row updates the existing entity and source reference;
   - unchanged rows remain unchanged and do not duplicate activities;
   - new rows are inserted;
   - missing rows are not automatically deleted;
   - exact normalized name plus phone collisions mark the older unverified contact `outdated`, set `duplicate_review_of`, and leave `is_hidden = false`;
   - verified contacts are not automatically downgraded on an ambiguous match.
4. Extend preview normalization and mapping aliases for the supplied workbook columns. Create stable workbook and row fingerprints from normalized source identity and material values.
5. Replace the import commit path with workspace-scoped match/update/insert behavior. Return explicit `created`, `updated`, `unchanged`, `review`, and `warning` counts. Every service-role or security-definer read/write must filter the workspace/owner explicitly.
6. Preserve source references and revision history so later export can still reconstruct the latest known workbook representation.
7. Run focused import tests, migration tests, `npm run typecheck`, and `git diff --check`.
8. Run `gitnexus_detect_changes()` and commit: `feat: reconcile repeated CRM workbook imports`.

## Task 3: Replace workspace logos and repair table controls

**Files:**
- Modify: `src/components/WorkspaceBrand.tsx`
- Modify: `src/pages/WorkspaceSelectorView.tsx`
- Modify: `src/components/Layout.tsx`
- Modify: `tests/workspaceBrand.test.ts`
- Modify: `src/components/crm/CrmColumnPicker.tsx`
- Modify: `src/components/crm/CrmColumnPicker.test.tsx`
- Modify: `src/pages/crm/CrmContacts.tsx`
- Modify: `src/pages/crm/CrmDeals.tsx`
- Modify: `src/lib/crm/tableColumns.ts`
- Modify: `src/lib/tablePreferences.ts`
- Modify: `src/lib/tablePreferences.test.ts`

**Steps:**

1. Run GitNexus impact analysis for `WorkspaceBrand`, `CrmColumnPicker`, and the contacts/deals page components.
2. Write failing rendering tests proving workspace names remain unchanged, no third-party image/logo URL is rendered, and each workspace receives a distinct neutral database icon color.
3. Write failing interaction tests for opening the column chooser, toggling fields, retaining a small useful default set, persisting choices, and restoring them on Contacts and Deals.
4. Replace company logos with accessible inline database icons. Remove the image assets from active rendering but do not rename workspaces.
5. Repair the column picker layering, click handling, responsive placement, and preference persistence. Add all newly supported fields to the available columns while keeping the default visible set compact.
6. Run the focused component tests, `npm run typecheck`, and `npm run build`.
7. Run `gitnexus_detect_changes()` and commit: `feat: simplify workspace branding and table controls`.

## Task 4: Add contact lifecycle, role search, and bulk hiding

**Files:**
- Modify: `src/hooks/crm/useCrmContacts.ts`
- Modify: `src/pages/crm/CrmContacts.tsx`
- Modify: `src/components/crm/ContactEditor.tsx`
- Modify: `src/lib/crm/inputs.ts`
- Modify: `src/lib/crm/inputs.test.ts`
- Create: `src/lib/crm/contactLifecycle.ts`
- Create: `src/lib/crm/contactLifecycle.test.ts`
- Modify: `supabase/migrations/20261004210000_client_crm_workflow_upgrades.sql`
- Modify: `supabase/migrations/20261004210000_client_crm_workflow_upgrades.test.ts`

**Steps:**

1. Run impact analysis for the contacts list RPC, `useCrmContacts`, `CrmContacts`, and `ContactEditor`.
2. Add failing tests for searching by role/designation, filtering hidden/outdated/verified/review records, state labels, and selection of only currently filtered outdated contacts for mass hide.
3. Extend the list RPC search predicate to include role/designation, company name, phone, email, and full name, always scoped to the active workspace.
4. Add one `State` column for Verified, Outdated, Unverified, and Duplicate review indicators, plus an independent Hidden indicator/filter. Add row actions for verify, mark outdated, hide/show, and resolve review.
5. Add a guarded `Hide outdated` bulk action that updates only selected or currently filtered outdated rows after showing the affected count; never auto-hide during import.
6. Invalidate only the relevant contact/detail/query-count keys after mutations and retain the user's column/filter preferences.
7. Run focused tests, `npm run typecheck`, and `npm run build`.
8. Run `gitnexus_detect_changes()` and commit: `feat: add contact lifecycle review workflow`.

## Task 5: Separate deal outcomes and expose company activity summaries

**Files:**
- Modify: `src/hooks/crm/useCrmDeals.ts`
- Modify: `src/pages/crm/CrmDeals.tsx`
- Modify: `src/components/crm/DealEditor.tsx`
- Modify: `src/hooks/crm/useCrmCompanies.ts`
- Modify: `src/pages/crm/CrmCompanies.tsx`
- Modify: `src/components/crm/CompanyEditor.tsx`
- Modify: `src/lib/crm/options.ts`
- Modify: `src/lib/crm/options.test.ts`
- Modify: `src/lib/crm/tableColumns.ts`
- Modify: `supabase/migrations/20261004210000_client_crm_workflow_upgrades.sql`

**Steps:**

1. Run impact analysis for the deal/company list RPCs, hooks, pages, and editors.
2. Add failing tests proving Deal Stage, Call Outcome, and Appointment Status remain independently editable and independently selectable as columns.
3. Add standard customer statuses `Current Customer`, `Prospect`, `Former Customer`, and `Maintenance Customer`, while accepting a trimmed custom value.
4. Extend the company list projection with latest activity/note time, last contact date, follow-up date, last call outcome, and call-log summary derived from the newest relevant activity. Do not copy stale denormalized values when a query/view can derive them safely.
5. Expose the new company and deal fields in editors, tables, filters, and column preferences with workbook-aligned labels.
6. Ensure imported Active Support/AMC rows suggest Current or Maintenance status and Inactive rows suggest Former status, but manual edits override future inferred suggestions unless the source value explicitly changes.
7. Run focused tests, migration tests, `npm run typecheck`, and `npm run build`.
8. Run `gitnexus_detect_changes()` and commit: `feat: add deal outcomes and customer status`.

## Task 6: Make timeline notes and call outcomes editable

**Files:**
- Modify: `src/hooks/crm/useCrmActivities.ts`
- Modify: `src/components/crm/CrmActivityComposer.tsx`
- Modify: `src/components/crm/CrmActivityComposer.test.tsx`
- Modify: `src/components/crm/CrmDetailContent.tsx`
- Modify: `src/components/crm/CrmDetailContent.test.tsx`
- Modify: `src/lib/crm/activityInput.ts`
- Modify: `src/lib/crm/activityInput.test.ts`
- Modify: `supabase/migrations/20261004210000_client_crm_workflow_upgrades.sql`

**Steps:**

1. Run impact analysis for the activity hook, composer, detail timeline, and activity update RPC.
2. Add failing tests for editing note/call bodies, setting a call outcome, canceling without mutation, preserving original `created_at`/`created_by`, and showing `updated_at`/`updated_by` after save.
3. Add a workspace-member-checked update RPC that changes only allowed activity fields and updates audit metadata.
4. Add inline/modal editing to the timeline for authorized members. Keep original source/provenance badges visible and do not permit editing archived source identity.
5. Refresh the detail timeline and company summary after a successful edit; preserve the user's scroll/context on failure.
6. Run focused tests, migration tests, `npm run typecheck`, and `npm run build`.
7. Run `gitnexus_detect_changes()` and commit: `feat: support editable CRM activity timelines`.

## Task 7: Add selected-row and configurable-column exports

**Files:**
- Create: `src/components/crm/CrmExportDialog.tsx`
- Create: `src/components/crm/CrmExportDialog.test.tsx`
- Create: `src/lib/crm/exportSelection.ts`
- Create: `src/lib/crm/exportSelection.test.ts`
- Modify: `src/pages/crm/CrmCompanies.tsx`
- Modify: `src/pages/crm/CrmContacts.tsx`
- Modify: `src/pages/crm/CrmDeals.tsx`
- Create: `supabase/functions/export-crm-records/index.ts`
- Create: `supabase/functions/export-crm-records/index.test.ts`
- Modify: `supabase/config.toml`

**Steps:**

1. Run impact analysis for the three list pages, existing export helpers, and Edge Function registration.
2. Add failing UI tests for per-row checkboxes, select-current-page, select-all-matching, exporting selected rows, and choosing an ordered column subset.
3. Add failing Edge Function tests rejecting unknown entity types/columns, cross-workspace IDs, unauthenticated requests, and oversized selections. Assert that allowed exports preserve requested column order.
4. Implement an allowlisted export schema for companies, contacts, and deals. The function must derive the user from the JWT, verify workspace membership, filter every query by workspace, and never accept arbitrary SQL column names.
5. Generate XLSX/CSV content from selected IDs or the current server-side filter. Preserve source-facing labels where round-trip mappings exist.
6. Add row selection and the export dialog to all three pages. Keep selection stable across column changes and clear it when workspace/filter identity changes.
7. Run UI/function tests, `npm run typecheck`, and `npm run build`.
8. Run `gitnexus_detect_changes()` and commit: `feat: add configurable CRM record exports`.

## Task 8: Show global due-task popups

**Files:**
- Create: `src/components/crm/CrmReminderCenter.tsx`
- Create: `src/components/crm/CrmReminderCenter.test.tsx`
- Modify: `src/hooks/crm/useCrmTasks.ts`
- Modify: `src/components/Layout.tsx`
- Modify: `src/lib/crm/tasks.ts`
- Modify: `src/lib/crm/tasks.test.ts`

**Steps:**

1. Run impact analysis for `useCrmTasks`, `Layout`, and task reminder helpers.
2. Add failing tests proving unread due/soon notifications produce one non-blocking popup, can be snoozed/dismissed, remain visible in a notification center, and do not reopen continuously in the same session.
3. Reuse the existing `crm_notifications` materialization/cron rather than adding a second scheduler. Add a query for unread reminders scoped to active workspace and user.
4. Mount the reminder center in authenticated layout routes. Include task title, due time, record link, and actions for open, snooze, and dismiss.
5. Keep the Tasks page banner as a summary and synchronize its state with global notifications.
6. Run focused tests, `npm run typecheck`, and `npm run build`.
7. Run `gitnexus_detect_changes()` and commit: `feat: add global CRM task reminders`.

## Task 9: Support rich HTML/table email templates and uploaded images

**Files:**
- Create: `src/lib/emailTemplateHtml.ts`
- Create: `src/lib/emailTemplateHtml.test.ts`
- Modify: `src/components/TemplateEditor.tsx`
- Modify: `src/hooks/useTemplates.ts`
- Modify: `src/lib/types.ts`
- Modify: `src/pages/crm/CrmEmailCampaigns.tsx`
- Modify: `supabase/functions/_shared/emailProviders.ts`
- Create: `supabase/functions/_shared/emailProviders.test.ts`
- Modify: `supabase/functions/process-email-queue/index.ts`
- Modify: `supabase/migrations/20261004210000_client_crm_workflow_upgrades.sql`

**Steps:**

1. Run impact analysis for `TemplateEditor`, `useTemplates`, both provider senders, and the queue processor.
2. Add failing tests for importing `.htm`/`.html`, resolving the companion image ZIP by content ID/file name, rejecting scripts/unsafe URLs/event handlers, preserving table layout, and generating a plain-text fallback.
3. Add failing provider tests proving Microsoft Graph sends `text/html` MIME and Brevo sends `htmlContent` with a text fallback. Retain current cooldown, cap, unsubscribe, and queue behavior.
4. Implement a deliberately small editor: upload HTML, upload companion ZIP/images, sanitized preview, subject/body editing, and plain-text fallback. Do not build a general drag-and-drop page builder.
5. Upload only non-sensitive campaign assets to a dedicated public email-assets bucket under owner/workspace-prefixed paths. Validate MIME/type/size, generate collision-resistant names, and store asset metadata with the template.
6. Rewrite `cid:`/relative image references to the uploaded public URLs and sanitize again before storage/send. Verify the supplied 12-table/7-image sample renders without embedding multi-megabyte base64 content.
7. Wire Graph and Brevo providers to select plain versus HTML content from the template while retaining existing text templates.
8. Run focused browser/unit/Deno tests, `npm run typecheck`, and `npm run build`.
9. Run `gitnexus_detect_changes()` and commit: `feat: add rich HTML email templates`.

## Task 10: Reproduce and fix password changes in both settings routes

**Files:**
- Modify: `src/lib/passwordChange.ts`
- Modify: `src/lib/passwordChange.test.ts`
- Modify: `src/hooks/useAuth.tsx`
- Modify: `src/pages/Settings.tsx`
- Modify: `src/pages/crm/CrmSalesSettings.tsx`
- Create: `src/pages/passwordSettings.test.tsx`

**Steps:**

1. Run impact analysis for `updatePasswordWithReauthentication`, the auth hook method, and both settings pages.
2. Reproduce the behavior with tests for wrong current password, stale session, same old/new password, weak password, successful reauthentication/update, form clearing, and Supabase error display. Do not guess at the cause.
3. Make the smallest correction supported by the failing reproduction. Ensure both workspace routes call the same real helper and neither silently succeeds on a placeholder/no-op path.
4. Add loading/success/error states that are truthful and accessible; never log passwords.
5. Run focused tests, `npm run typecheck`, and `npm run build`.
6. Run `gitnexus_detect_changes()` and commit: `fix: make password changes verifiable`.

## Task 11: Integrated verification, deployment, and production evidence

**Files:**
- Modify if needed: `docs/development/2026-10-04-client-crm-workflow-upgrades-handoff.md`
- Create: `docs/development/2026-10-04-client-crm-workflow-upgrades-handoff.md`

**Steps:**

1. Run the complete local gate: `npm test -- --run`, `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`.
2. Run Supabase migration/function tests, inspect `npx supabase migration list`, and confirm local migration versions align with the remote project before any deployment claim.
3. Use the installed CLI to verify authentication/linkage with `vercel whoami` and `vercel project inspect` (or `vercel link` only if the repository is not already linked). Pull environment metadata without printing secret values.
4. Exercise real flows against an isolated test workspace: initial workbook import; edited same-file re-upload; duplicate review/outdated/not-hidden; bulk hide; role search; activity edit; company summary; deal outcome/status/stage; selected row/column export; due reminder; HTML template preview/send to a controlled mailbox; password change and sign-in with the new password.
5. Inspect the actual rendered desktop and narrow/mobile UI for selector branding, Contacts/Deals column controls, export modal, duplicate badges, reminder popup, activity editor, and email preview.
6. Run `gitnexus_detect_changes()` and confirm only intended processes are affected. Update the handoff with exact test results, migration/function deployment state, provider constraints, screenshots/evidence paths, branch, commit SHAs, and any blockers.
7. Commit the handoff: `docs: record CRM workflow upgrade verification`.
8. Push the feature branch and open a pull request. Confirm CI checks. Merge only if branch protection and independent review requirements are satisfied.
9. Verify the Vercel deployment is READY and that the deployed commit matches the merged SHA. Verify Supabase migrations/functions independently; do not infer backend deployment from a green frontend build.
10. Repeat the highest-risk authenticated production smoke checks with non-sensitive test data and report verified results separately from unverified/provider-dependent items.

## Acceptance checklist

- Workspace names remain; third-party/company logos are absent and neutral database icons differ by workspace.
- Re-uploading an edited workbook updates linked rows and activities without cloning the whole file.
- Older exact name+phone duplicates become Outdated and Review-required, remain visible, and can be hidden individually or in bulk.
- Contacts search by role/designation and expose verified/outdated/review/hidden filters.
- Companies expose customer status and recent activity summaries.
- Deal Stage, Call Outcome, and Appointment Status are independent fields and columns.
- Activity notes/calls are editable with audit metadata.
- Companies, contacts, and deals can export selected/all-matching rows with user-selected columns.
- Due-task notifications appear globally without repeated popup spam.
- HTML/table/image templates render and send through both Graph and Brevo with plain-text fallback.
- Password changes work from both settings routes and are proven by re-login.
- Existing provenance, 30-day recovery, tenancy, cooldown, and export round-trip behavior remains intact.
