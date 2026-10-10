# Email delivery operations handoff

## Outcome

QuotePulse now keeps an auditable email trail from both campaigns and contacts, preserves every retry attempt, previews the exact stored recipient content, and provides a dedicated Operations module for delivery health, provider usage, budgets, and storage capacity. Imported Outlook HTML can be cleaned and edited without the malformed Sent/Subject header reappearing in preview.

## Architecture and safety

- `crm_email_campaigns`, `crm_campaign_recipients`, and append-only `email_sends` remain delivery truth.
- `crm_campaign_recipient_reporting` and `crm_contact_email_history` are security-invoker read models over RLS-protected data.
- `crm_retry_failed_email_send` requires authentication, active workspace membership, original sender ownership, a terminal failed result, and no provider message ID. The original attempt is never overwritten.
- `provider_usage_events` and `provider_budget_settings` are owner/workspace scoped. Service-role code supplies and filters owner/workspace explicitly.
- Brevo health is fetched server-side; provider credentials and raw secret-bearing responses never reach the browser.
- Telemetry writes are best effort. Email, KYC, and OCR results remain authoritative if telemetry storage is unavailable.
- HTML email content is displayed in sandboxed frames.

## User experience

- Templates: cleaned subject extraction, editable HTML source, matching live preview, responsive wide editor.
- Campaigns: expandable recipient ledger, clear aggregate outcome, per-attempt status/timestamps/provider details, exact content preview, and safe retry controls.
- Contacts: Email history is attached to the contact record and shows the same immutable send snapshots.
- Operations: delivery queue/failure health, Brevo provider-reported availability and rate limits, CRM-tracked Microsoft/Serper/NVIDIA usage, configurable budgets/reset dates, and database/R2 storage capacity.
- Settings: one-click Brevo connection check with actionable unrecognised-IP guidance.
- Queue safety: only a recent, definitive unhealthy Brevo result blocks queueing; unknown telemetry does not masquerade as failure.

## Files and deployment

- Migration: `supabase/migrations/20261011120000_email_delivery_operations.sql`
- New Edge Function: `provider-status` (`verify_jwt = true`)
- Updated provider call sites: `process-email-queue`, `enrich-kyc`, and `parse-quote`
- Sales route: `/w/:workspaceId/sales/operations`
- Supabase workflow deploy list includes `provider-status` and applies the migration before function deployment.

## Verification

- Full Vitest: 189 files passed, 1 skipped; 680 tests passed, 9 skipped.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed with existing non-blocking Vite advisories only.
- GitNexus pre-edit impact checks were low for Task 5 symbols. Worktree change detection covered the expected workspace navigation/rendering, campaign submit, and settings flows.

Detailed reproducible acceptance steps are in `docs/testing/2026-10-11-email-delivery-operations-acceptance.md`.

## Operational notes

- Brevo sender/IP authorization is external account configuration. The CRM now reports it clearly but cannot whitelist an IP on the user's behalf.
- Serper and NVIDIA do not provide a dependable remaining-credit endpoint for this integration, so their cards are explicitly CRM tracked against user-configured budgets.
- Missing provider data is displayed as Unknown.
- A transport timeout after provider submission remains non-retryable because delivery may already have occurred.

## Continuation point

The implementation is ready for independent review and release. After merge, update the acceptance record with the exact merge SHA, GitHub Actions/Supabase result, Vercel deployment ID/URL, and authenticated production observations.
