# R2 Archive Browser and Campaign Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secure read-only R2 archive browsing with selective restore and make Email Campaigns preview, edit, select recipients for, and queue the exact reviewed message.

**Architecture:** The authenticated `workspace-archive` Edge Function reads and verifies bounded R2 chunks while the frontend keeps archived and live queries separate. Campaign drafts snapshot HTML/text at queue time, use a shared pure personalization renderer, and keep an explicit recipient-ID collection independent from audience filters.

**Tech Stack:** React 18, TypeScript, TanStack Query, Supabase Postgres/Auth/Edge Functions, Cloudflare R2, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-08-archive-browser-campaign-review-design.md`

## Global Constraints

- Archived rows remain read-only; R2 objects are never rewritten.
- Every R2 read validates authenticated ownership, allow-listed table, contained key, checksum, and payload identity.
- Archive work is bounded: at most two normal page objects or a small fixed search batch per request.
- Selective restoration is dependency-aware, idempotent for equivalent rows, and fail-closed for divergent/cross-owner conflicts.
- Campaign edits are campaign-local and never silently update `email_templates`.
- Choose all matching applies to the full active filter, selections persist across filter changes, and the existing 5,000-recipient limit remains authoritative.
- Service-role code explicitly scopes owner/workspace reads and writes.

## Review Focus

- A tampered archive cursor or cross-owner archive ID must return no rows.
- Archive objects with a correct pointer but incorrect checksum or embedded identity must fail closed.
- Select-all followed by another industry selection must union and deduplicate recipients without losing the first group.
- Switching templates with unsaved campaign edits must require confirmation and preserve the draft when cancelled.
- Preview, queued snapshot, and provider payload must remain identical after personalization and unsubscribe-link injection.

---

### Task 1: Campaign recipient selection model

**Files:**
- Create: `src/lib/crm/campaignRecipients.ts`
- Create: `src/lib/crm/campaignRecipients.test.ts`
- Modify: `src/hooks/crm/useCrmCampaigns.ts`
- Modify: `src/lib/crm/campaignInput.ts`
- Modify: `src/lib/crm/campaignInput.test.ts`

**Interfaces:**
- Produces: `CampaignRecipientSelection`, `addRecipients`, `removeRecipient`, `clearRecipients`, and a `resolveMatchingRecipientIds` query returning deduplicated eligible IDs.
- Consumes: existing `crm_campaign_audience` identity and eligibility fields.

- [ ] Write failing tests proving two filtered result sets union by contact ID/email, filter changes do not clear selection, individual removal works, Clear all works, and additions over 5,000 are rejected without changing existing selection.
- [ ] Run `npx vitest run src/lib/crm/campaignRecipients.test.ts src/lib/crm/campaignInput.test.ts`; expect failures because the selection API and explicit-recipient contract do not exist.
- [ ] Implement immutable selection helpers and extend `useCrmCampaigns` with a paginated server query that resolves every eligible ID for the active search/industry filter, capped at 5,000.
- [ ] Update campaign input validation so queueing consumes explicit selected contact IDs only; retain server-side eligibility and duplicate-email checks.
- [ ] Re-run the focused tests; expect all pass.
- [ ] Commit: `feat: add persistent campaign recipient selection`.

### Task 2: Immutable campaign HTML/text snapshots

**Files:**
- Create: `supabase/migrations/<timestamp>_campaign_content_snapshots.sql`
- Create: `supabase/migrations/<timestamp>_campaign_content_snapshots.test.ts`
- Modify: `src/lib/crm/campaignInput.ts`
- Modify: `src/hooks/crm/useCrmCampaigns.ts`
- Modify: `src/lib/crm/types.ts`
- Modify: `supabase/functions/process-email-queue/index.ts`
- Modify: `supabase/functions/process-email-queue/campaign.test.ts`

**Interfaces:**
- Produces: queue RPC inputs `p_body_html` and `p_body_text`; campaign/recipient immutable snapshot columns; worker consumption of snapshots without rereading templates.
- Consumes: Task 1 explicit recipient IDs and existing provider renderer.

- [ ] Write migration and worker tests asserting owner-scoped template validation, HTML/text snapshot persistence, immutable recipient copies, old-signature compatibility, and no send-time template reread.
- [ ] Run the focused migration/worker tests; expect failures on absent columns/signature and current template lookup behavior.
- [ ] Create the timestamped migration using the repository migration convention. Add snapshot columns, a compatibility RPC, strict 5,000 limit, explicit-ID eligibility/deduplication, and grants/RLS consistent with existing tables.
- [ ] Update the hook/types/worker to pass and render stored HTML/text snapshots for both Graph and Brevo.
- [ ] Run migration, hook, input, and worker tests; expect all pass.
- [ ] Commit: `feat: snapshot reviewed campaign content`.

### Task 3: Shared preview renderer and campaign composer

**Files:**
- Create: `src/lib/emailCampaignPreview.ts`
- Create: `src/lib/emailCampaignPreview.test.ts`
- Create: `src/components/crm/CampaignRecipientPicker.tsx`
- Create: `src/components/crm/CampaignRecipientPicker.test.tsx`
- Create: `src/components/crm/CampaignMessageEditor.tsx`
- Create: `src/components/crm/CampaignMessageEditor.test.tsx`
- Modify: `src/pages/crm/CrmEmailCampaigns.tsx`
- Modify: `src/styles/index.css`

**Interfaces:**
- Produces: pure `renderCampaignPreview(content, recipient)` and campaign draft `{subject, bodyHtml, bodyText}` passed unchanged to Task 2 queue mutation.
- Consumes: Task 1 selection model and Task 2 snapshot input.

- [ ] Write failing tests for template initialization, campaign-local HTML/text edits, unsaved-edit replacement cancellation, personalized subject/HTML/text preview, unresolved-token errors, separate matching/selected panels, Choose all matching, persistent selections, individual removal, Clear all, and final-review values.
- [ ] Run the new component/library tests; expect failures because the components and renderer do not exist.
- [ ] Implement the pure renderer using the same supported tokens as the queue worker, then compose the message editor with sandboxed preview and recipient selector.
- [ ] Implement the matching browser and independent selected-recipient panel. Do not clear selection from search/industry handlers; clear only after explicit Clear all or successful queueing.
- [ ] Replace the current campaign form message/recipient sections and add a final Review campaign step whose values are passed directly to the queue mutation.
- [ ] Re-run focused tests; expect all pass.
- [ ] Commit: `feat: preview and edit exact campaign messages`.

### Task 4: Authenticated bounded R2 archive reads

**Files:**
- Create: `supabase/functions/workspace-archive/archiveBrowse.ts`
- Create: `supabase/functions/workspace-archive/archiveBrowse.test.ts`
- Modify: `supabase/functions/workspace-archive/index.ts`
- Modify: `supabase/functions/workspace-archive/workflow.test.ts`
- Modify: `src/lib/functions.ts`

**Interfaces:**
- Produces: `browse` and `record` actions returning sanitized rows, opaque continuation cursors, progress, and archive metadata.
- Consumes: `getArchiveJson`, `verifyArchivePayload`, `assertWorkspaceArchivePointer`, archive object metadata, and legacy table allow-list.

- [ ] Write failing tests for allowed tables, owner/workspace enforcement, cursor tampering, page-size bounds, at-most-two-object normal pages, bounded search continuation, pointer containment, checksum mismatch, payload identity mismatch, and no R2/object-key leakage.
- [ ] Run the archive tests; expect failures because read actions do not exist.
- [ ] Extract pure cursor, row projection, search, and paging functions; use an HMAC-authenticated opaque cursor derived from the existing server secret.
- [ ] Add authenticated actions to the Edge Function, explicitly scope every service-role metadata query, and return no mutation capability.
- [ ] Add typed frontend function wrappers and rerun focused tests plus Deno check.
- [ ] Commit: `feat: browse verified legacy archive from R2`.

### Task 5: Dependency-aware selective restore

**Files:**
- Create: `supabase/functions/workspace-archive/archiveRestoreRecord.ts`
- Create: `supabase/functions/workspace-archive/archiveRestoreRecord.test.ts`
- Create: `supabase/migrations/<timestamp>_restore_archived_record.sql`
- Create: `supabase/migrations/<timestamp>_restore_archived_record.test.ts`
- Modify: `supabase/functions/workspace-archive/index.ts`
- Modify: `src/lib/functions.ts`

**Interfaces:**
- Produces: `restore_record` action with `restored`, `already_restored`, or `conflict` result and a service-role-only transactional RPC.
- Consumes: Task 4 verified row resolution and the legacy allow-list restore order/dependency definitions.

- [ ] Write failing tests for company restore, contact/deal parent restoration, equivalent-row idempotence, divergent live conflict, cross-owner refusal, invalid dependency rollback, checksum re-verification, and unchanged R2 metadata.
- [ ] Run focused tests; expect missing action/RPC failures.
- [ ] Create the transactional private RPC with fixed search path, explicit grants, owner checks, deterministic dependency order, and no overwrite path.
- [ ] Implement server-side record/dependency resolution from verified archive content and call the RPC only after validation.
- [ ] Re-run focused SQL/Edge tests and a rolled-back linked-database probe.
- [ ] Commit: `feat: restore selected archived records safely`.

### Task 6: Archived Companies, Deals, and Contacts UI

**Files:**
- Create: `src/hooks/useArchivedCrmRecords.ts`
- Create: `src/components/crm/ArchivedRecordTable.tsx`
- Create: `src/components/crm/ArchivedRecordTable.test.tsx`
- Create: `src/components/crm/ArchivedEditWarning.tsx`
- Create: `src/components/crm/ArchivedEditWarning.test.tsx`
- Modify: `src/pages/Dashboard.tsx`
- Modify: `src/styles/index.css`

**Interfaces:**
- Produces: Live/Archived tabs, table-specific archived views, search continuation, record details, and restore-on-edit warning.
- Consumes: Task 4 browse/record responses and Task 5 restore results.

- [ ] Write failing UI tests for Live/Archived separation, archive badges/timestamp, tolerant missing fields, paging, bounded-search progress, read-only mutation controls, warning copy, Cancel, Restore record, conflict display, and live-query refresh after restore.
- [ ] Run the focused UI tests; expect failures because archive components do not exist.
- [ ] Implement the query hook and shared archived table with table-specific column maps; keep query keys isolated from live lists.
- [ ] Add the segmented control and restore warning. In archived mode Edit opens the warning rather than a live editor.
- [ ] Re-run focused tests; expect all pass.
- [ ] Commit: `feat: expose read-only archived CRM records`.

### Task 7: Integrated verification, documentation, and release

**Files:**
- Modify: `docs/development/2026-10-08-verified-legacy-archive-deletion.md`
- Create: `docs/development/2026-10-08-archive-browser-campaign-review-handoff.md`

**Interfaces:**
- Consumes all prior task contracts; produces the durable release/acceptance record.

- [ ] Run all focused suites from Tasks 1-6 and confirm every test passes.
- [ ] Run `npm test -- --run`, `npm run typecheck`, `npm run lint`, and `npm run build`; expect zero failures.
- [ ] Run Deno checks for `workspace-archive` and `process-email-queue`, migration-list validation, transactional SQL security/performance tests, and Supabase advisors.
- [ ] Update documentation with architecture, commands, migration/function versions, known limits, and rollback behavior.
- [ ] Run `npx gitnexus detect-changes` through the MCP tool, review every affected process, and resolve unexpected scope.
- [ ] Commit: `docs: record archive browser and campaign review release`.
- [ ] Push the branch, open a PR, wait for required checks/review, merge under the user's standing release authorization, verify the exact-main-SHA Supabase workflow and Vercel Production Ready deployment.
- [ ] Authenticated production acceptance: browse known archived records without increasing live counts; restore one controlled record and verify R2 unchanged; exercise persistent cross-filter selection and exact personalized campaign preview. Do not send a real email without a controlled recipient and action-time confirmation.
