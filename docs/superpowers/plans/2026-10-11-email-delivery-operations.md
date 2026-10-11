# Email Delivery Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make campaign delivery auditable from campaigns and contacts, expose honest provider/storage operations, prevent known Brevo failures, and make imported Outlook templates faithfully editable.

**Architecture:** Preserve `crm_email_campaigns`, `crm_campaign_recipients`, and `email_sends` as the delivery truth. Add owner-safe read models, append-only manual retry support, lightweight provider telemetry, focused React hooks/components, and a new Operations route. Keep previews sandboxed and all provider credentials server-side.

**Tech Stack:** React 18, TypeScript, TanStack Query, Supabase Postgres/RLS/RPC, Supabase Deno Edge Functions, Vitest, Tailwind/CSS.

**Spec:** `docs/superpowers/specs/2026-10-11-email-delivery-operations-design.md`

## Global Constraints

- Service-role reads and writes must filter explicitly by owner and workspace.
- Migrations use a 14-digit timestamp prefix.
- Provider values are labelled `Provider reported` or `CRM tracked`; unknown is never shown as zero.
- HTML is displayed only in sandboxed iframes.
- Manual retry is allowed only for definitive terminal failures with no provider message ID and must preserve the prior attempt.
- The legacy workspace storage/archive experience is unchanged.
- Run GitNexus impact before changing every function, class, or method and `gitnexus_detect_changes()` before every commit.

## Review Focus

- A transport timeout after submission remains blocked for review and cannot create a duplicate retry.
- A recipient whose current row points to a retry still shows every historical attempt in order.
- Missing provider usage data renders `Unknown`, not `0 remaining` or a healthy state.
- Imported HTML containing malformed Outlook headers removes only leading metadata, not legitimate body text mentioning `Subject` or `Sent`.
- A telemetry insert failure cannot change a successful email, KYC, or OCR provider result into a failed business action.

---

### Task 1: Outlook template normalisation and editor fidelity

**Files:**
- Modify: `src/lib/emailTemplateHtml.ts`
- Modify: `src/lib/emailTemplateHtml.test.ts`
- Modify: `src/components/TemplateEditor.tsx`
- Modify: `src/components/TemplateEditor.test.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Produces: `sanitizeImportedSubject(value: string): string`
- Produces: `prepareImportedEmailHtml(rawHtml: string): { html: string; text: string; subject: string }`

- [ ] Add failing tests for leading Outlook Sent/Subject removal, clean subject extraction, legitimate body text preservation, and replacement-character cleanup.
- [ ] Run `npm test -- --run src/lib/emailTemplateHtml.test.ts src/components/TemplateEditor.test.tsx` and confirm the new assertions fail.
- [ ] Implement subject sanitisation/header removal and initialise existing templates through the same normaliser.
- [ ] Make the HTML source field drive HTML preview/save, relabel text as fallback, sandbox the iframe, lock body scroll, and widen the responsive dialog to the approved 40/60 layout.
- [ ] Re-run the focused tests and commit the green slice.

### Task 2: Delivery read models and append-only retries

**Files:**
- Create: `supabase/migrations/20261011120000_email_delivery_operations.sql`
- Create: `supabase/migrations/20261011120000_email_delivery_operations.test.ts`
- Modify: `src/lib/crm/types.ts`

**Interfaces:**
- Produces: `crm_campaign_recipient_reporting` security-invoker view.
- Produces: `crm_contact_email_history` security-invoker view.
- Produces: `crm_retry_failed_email_send(p_workspace_id uuid, p_email_send_id uuid): jsonb`.
- Produces: `CrmCampaignRecipientReport` and `CrmEmailSendHistory` TypeScript records.

- [ ] Add migration contract tests for view grants/RLS dependency, retry authentication/membership, definitive-state guard, missing provider ID guard, and append-only linkage.
- [ ] Run the migration test and confirm it fails before the migration exists.
- [ ] Add `retry_of_id` to `email_sends`, indexes, reporting views, and a security-definer transactional retry RPC that creates a new send and preserves the old send.
- [ ] Ensure the recipient points to the new attempt while reporting retains the full chain; classify ambiguous outcomes as non-retryable.
- [ ] Run migration tests and commit the green database slice.

### Task 3: Campaign recipient ledger and contact email history

**Files:**
- Modify: `src/hooks/crm/useCrmCampaigns.ts`
- Create: `src/hooks/crm/useCrmEmailHistory.ts`
- Create: `src/lib/crm/emailDelivery.ts`
- Create: `src/lib/crm/emailDelivery.test.ts`
- Create: `src/components/crm/EmailContentPreview.tsx`
- Create: `src/components/crm/CampaignRecipientLedger.tsx`
- Create: `src/components/crm/ContactEmailHistory.tsx`
- Modify: `src/pages/crm/CrmEmailCampaigns.tsx`
- Modify: `src/pages/crm/CrmEmailCampaigns.test.tsx`
- Modify: `src/components/crm/CrmDetailContent.tsx`
- Modify: `src/pages/crm/CrmRecordDetailPage.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Produces: `campaignOutcomeLabel(campaign: CrmEmailCampaign): string`.
- Produces: `classifyDeliveryFailure(row): { summary: string; retryable: boolean }`.
- Produces: `useCampaignRecipients(workspaceId, campaignId)` and `useContactEmailHistory(workspaceId, contactId)`.

- [ ] Add failing unit/component tests for `Completed with failures`, status/timestamps/provider rendering, sandboxed exact snapshots, attempt ordering, and contact-linked history.
- [ ] Run the focused tests and confirm failures.
- [ ] Implement typed queries, campaign disclosure/detail UI, friendly error summaries, retry mutation, and contact Email history.
- [ ] Preserve raw text for technical disclosure but never render provider content as application HTML.
- [ ] Run focused tests and commit the green UI slice.

### Task 4: Provider telemetry and Brevo health

**Files:**
- Extend: `supabase/migrations/20261011120000_email_delivery_operations.sql`
- Create: `supabase/functions/provider-status/index.ts`
- Create: `supabase/functions/_shared/providerTelemetry.ts`
- Modify: `supabase/functions/_shared/emailProviders.ts`
- Modify: `supabase/functions/process-email-queue/index.ts`
- Modify: `supabase/functions/enrich-kyc/index.ts`
- Modify: `supabase/functions/parse-quote/index.ts`
- Modify: `supabase/config.toml`
- Create: `tests/providerTelemetry.test.ts`

**Interfaces:**
- Produces: `recordProviderUsage(admin, event): Promise<void>` that never throws to the business flow.
- Produces: authenticated `provider-status` response with sanitised `brevo`, `microsoft`, `serper`, and `nvidia` cards.
- Produces: `classifyBrevoError(status: number, body: string): ProviderFailure`.

- [ ] Add failing tests for Brevo unrecognised-IP classification, rate headers, unknown balances, local usage windows, explicit owner/workspace filters, and telemetry failure isolation.
- [ ] Run the tests and confirm failures.
- [ ] Add workspace-scoped telemetry/budget tables with RLS and indexes, then implement best-effort writers in the actual provider call sites.
- [ ] Implement authenticated provider status: Brevo `/v3/account` plus rate headers, Microsoft persisted rolling sends, and CRM-tracked Serper/NVIDIA totals.
- [ ] Store no secrets or raw secret-bearing provider responses; run tests and commit the green backend slice.

### Task 5: Operations module, storage relocation, and preflight gate

**Files:**
- Create: `src/pages/crm/CrmOperations.tsx`
- Create: `src/pages/crm/CrmOperations.test.tsx`
- Create: `src/hooks/crm/useCrmOperations.ts`
- Create: `src/lib/crm/providerUsage.ts`
- Create: `src/lib/crm/providerUsage.test.ts`
- Modify: `src/lib/workspaceNavigation.ts`
- Modify: `src/components/Layout.tsx`
- Modify: `src/lib/crm/salesRoutes.ts`
- Modify: `src/lib/crm/salesRoutes.test.ts`
- Modify: `src/pages/SalesWorkspacePage.tsx`
- Modify: `src/pages/SalesWorkspacePage.test.tsx`
- Modify: `src/pages/crm/CrmDashboard.tsx`
- Modify: `src/pages/crm/CrmSalesSettings.tsx`
- Modify: `src/hooks/crm/useCrmCampaigns.ts`
- Modify: `src/index.css`

**Interfaces:**
- Produces: `usageLevel(used: number | null, limit: number | null): 'unknown' | 'normal' | 'warning' | 'critical' | 'exhausted'`.
- Consumes: authenticated `provider-status` and existing `StorageStatusPanel`.

- [ ] Add failing route/navigation, warning-threshold, provider-label, stale-health, and storage-relocation tests.
- [ ] Run focused tests and confirm failures.
- [ ] Add Operations under Tools, render delivery/provider/storage cards, and remove `StorageStatusPanel` only from `CrmDashboard`.
- [ ] Add Settings connection check and prevent Brevo queueing only when a fresh check is definitively unhealthy; surface the unrecognised-IP remediation.
- [ ] Run focused tests and commit the green operations slice.

### Task 6: End-to-end verification and release handoff

**Files:**
- Create: `docs/testing/2026-10-11-email-delivery-operations-acceptance.md`
- Modify: project handoff document identified by repository convention.

**Interfaces:**
- Consumes all earlier tasks; produces reproducible acceptance evidence.

- [ ] Run all focused Vitest and migration contract tests.
- [ ] Run `npm run typecheck` and `npm run build`; resolve every regression.
- [ ] Run `gitnexus_detect_changes()` and review every affected process, with special attention to shared `StorageStatusPanel` and queue execution.
- [ ] Push the feature branch, open the PR, verify GitHub/Supabase CI and the Vercel deployment for the exact SHA, then merge when branch rules allow.
- [ ] In the authenticated production workspace verify template import/edit/preview, the known failed Brevo campaign ledger, contact email history, Operations labels, Sales-only storage relocation, and responsive layouts.
- [ ] Record exact SHA, deployment URLs/status, migration/function status, configuration still required for Brevo, screenshots or observed UI results, and any blocker in the acceptance/handoff docs.
