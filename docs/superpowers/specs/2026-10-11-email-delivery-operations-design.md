# Email delivery visibility, provider operations, and template fidelity

**Date:** 2026-10-11  
**Status:** Approved for implementation  
**Workspace:** QuotePulse CRM Sales CRM

## Outcome

Make outbound email observable and recoverable from campaign and contact records, expose honest provider and storage usage in one Operations area, prevent avoidable Brevo failures, and make imported Outlook HTML templates faithfully editable and previewable.

The existing delivery tables remain the source of truth. This work adds read models, attempt history, provider-health telemetry, and clearer UI; it does not replace the delivery queue or expose provider credentials to the browser.

## Confirmed production finding

The test campaign did not reach Brevo. Its single send failed with HTTP 401 because Brevo rejected the Supabase Edge Function's unrecognised outbound IPv6 address. The campaign-level status was still rendered as `completed`, which concealed the failure. Supabase Edge Functions do not provide a stable egress IP, so repeatedly allow-listing observed addresses is not a durable fix.

## User experience

### Campaign reporting

Each campaign row opens a recipient ledger that shows:

- recipient, linked contact and company;
- queued, processing, sent, failed, blocked, or cancelled state;
- attempt count and queued, attempted, sent, and failed timestamps;
- provider and provider message identifier when available;
- a friendly failure summary with technical details available on demand;
- the exact subject, plain-text fallback, and sanitised HTML snapshot used for that recipient.

Campaign status is presented from recipient outcomes. A campaign with no active recipients and at least one failure reads **Completed with failures**, not simply **Completed**. Aggregate counts remain visible on the list.

Definitive failures with no provider message ID may be retried manually. A manual retry creates a new auditable send attempt and preserves the failed attempt. Ambiguous outcomes are never retried automatically because doing so could duplicate an email.

### Contact email history

The Sales CRM contact detail page gains an Email history section. It lists every campaign send linked through `crm_contact_id`, including campaign, state, dates, provider, failure, subject, and the stored message snapshot. The HTML body opens in a sandboxed preview and is never injected into the application DOM.

### Operations

A new **Operations** module is added under Tools. It contains:

1. **Delivery health** — recent failures, queued work, oldest queued age, provider preflight state, and links to affected campaigns.
2. **Provider usage** — Brevo provider-reported account credits and request-window headers where available; Microsoft sends counted by QuotePulse over the configured rolling limit; Serper and NVIDIA calls counted by QuotePulse against administrator-configured budgets and reset dates.
3. **Storage** — the existing Supabase and Cloudflare R2 capacity panel, moved from the Sales CRM dashboard. The legacy workspace retains its current storage experience.

Every number is labelled either **Provider reported** or **CRM tracked**. The interface must not imply that a locally counted budget is an authoritative provider balance. Warning states appear at 80%, 95%, and exhausted. Informational budgets do not block calls unless an existing hard limit already does.

### Brevo preflight

Settings and Operations provide a server-side connection check. Campaign queueing is prevented when a fresh check proves the saved Brevo credentials are unusable. Stale or unavailable checks are shown as unknown rather than healthy. Delivery-time races still fall back to the normal persisted failure record.

The unrecognised-IP error is translated into an actionable message. The durable low-infrastructure option is a dedicated Brevo API key configured without unknown-IP blocking, acknowledging the security trade-off. A static outbound proxy is a separate infrastructure option and is not silently introduced by this feature.

### Template editor

Imported Outlook HTML is normalised before editing:

- Outlook `Sent:` and `Subject:` header paragraphs are removed from the body;
- a clean decoded subject is extracted into the Subject field when appropriate;
- replacement-character and mojibake noise is removed from the extracted subject;
- editing HTML updates the live preview and the saved HTML;
- the plain-text field is explicitly a fallback and no longer masquerades as the HTML body.

Existing templates are normalised when opened, so users do not have to re-import them. The editor uses a viewport-aware wide dialog, approximately 40% editor and 60% preview on desktop, with a useful preview width and height and a stacked layout on smaller screens. The preview is sandboxed. Body scroll is locked while the dialog is open so application-owned page gaps do not appear.

## Data design

### Existing records retained

- `crm_email_campaigns` remains campaign metadata.
- `crm_campaign_recipients` remains the current recipient outcome.
- `email_sends` remains the immutable message snapshot and provider result.

Existing subject, text, HTML, recipient snapshots, provider IDs, errors, and timestamps are surfaced rather than duplicated.

### Attempt history

Add an append-only attempt relationship so a manual retry does not erase the original failure. The preferred implementation is `email_sends.retry_of_id references email_sends(id)` plus a new send row for each manual retry. If current constraints make that unsafe, use a dedicated `email_send_attempts` table with the same ownership and workspace boundaries. The implementation plan must choose one after inspecting all queue writers and status triggers.

The recipient row points to the latest active attempt while campaign reporting queries the full chain. Retry creation is transactional and idempotent.

### Provider telemetry

Add workspace-scoped provider telemetry containing only non-secret operational data:

- provider and operation;
- units consumed when known;
- success/failure;
- observed timestamp;
- provider-reported limit, remaining, and reset timestamp when returned;
- a sanitised error category.

Add workspace-scoped budget settings for providers that do not expose an authoritative remaining balance. Credentials and raw secret-bearing responses are excluded.

Brevo account status is fetched server-side and cached briefly. Queue processing records Brevo rate-limit response headers. Serper/NVIDIA consumers record one local usage event per actual provider request. Microsoft usage derives from persisted sends rather than a second counter where possible.

## Security and tenancy

- Browser queries are protected by existing workspace membership and RLS patterns.
- Every service-role read and write filters explicitly by owner and workspace; RLS is not treated as protection for Edge Functions.
- Provider keys remain in `user_settings`/server-side secrets and are never returned to the browser.
- HTML previews use a sandboxed iframe with no script, navigation, or same-origin privileges.
- Provider errors shown to users are sanitised; raw internal responses are not rendered as HTML.
- Retry endpoints require authentication, workspace membership, a retryable terminal state, and absence of a provider message ID.

## Failure semantics

- A campaign may be operationally finished while containing failures; the UI represents both facts.
- Provider rejection before a message ID is a definitive failure and may be retried.
- Timeout or transport loss after submission is ambiguous unless provider reconciliation proves the outcome; it is held for review.
- A failed preflight does not modify queued or historical records.
- Telemetry failure never converts a successful provider action into a failed business action.
- Unknown limits display as unknown, never zero.

## Delivery sequence

1. Finish template normalisation tests and editor layout/fidelity fixes.
2. Add append-only retry/audit support and owner-safe campaign/contact read models.
3. Build campaign recipient drill-down and contact Email history.
4. Add provider telemetry and the Operations module; move only the Sales CRM storage panel.
5. Add Brevo preflight, friendly error classification, and safe manual retry.
6. Validate migrations and Edge Functions through CI, deploy the frontend, and exercise authenticated production flows.

## Verification and acceptance

- Unit tests cover Outlook header extraction, mojibake cleanup, HTML edit/preview/save fidelity, outcome labelling, warning thresholds, and error classification.
- Database tests cover workspace isolation, append-only retry history, idempotency, and latest-attempt selection.
- Edge Function tests cover explicit owner/workspace filtering and telemetry failure isolation.
- Component tests cover campaign drill-down, contact history, sandboxed previews, Operations labels, and responsive modal layout.
- `npm run build` and `npm run typecheck` pass.
- GitNexus change detection shows only expected flows before each commit.
- CI confirms the timestamped migration and function deployment.
- Authenticated production smoke testing verifies: failed Brevo campaign detail, contact-linked history, exact stored content, honest provider labels, storage relocation, template editing, and mobile/desktop layouts.

## Non-goals

- Guaranteeing a static Supabase Edge Function egress IP.
- Claiming exact Microsoft, Serper, or NVIDIA provider balances without an authoritative API.
- Automatically retrying ambiguous email outcomes.
- Moving or redesigning the legacy workspace storage/archive experience.
- Replacing Brevo, Microsoft Graph, Supabase, or R2.

## Documentation handoff

The implementation plan, migration notes, provider configuration steps, verified commands, deployment SHA, and any production-only blocker must be recorded under `docs/superpowers/plans/` and the existing project handoff documentation so another session can resume without inference.
