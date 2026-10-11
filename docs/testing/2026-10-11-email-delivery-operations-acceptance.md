# Email delivery operations acceptance

## Scope

This acceptance record covers Outlook HTML template cleanup and editing, campaign-recipient delivery history, contact-linked email history, append-only manual retries, provider telemetry, the Sales CRM Operations module, Brevo preflight protection, and relocation of Sales storage capacity from Dashboard to Operations.

The Legacy workspace archive and storage experience is intentionally unchanged.

## Local acceptance evidence

- Branch: `feat/email-delivery-operations`
- Implementation commits: `38a2610`, `6091596`, `574d125`, `e2276ed`, `235022d`, `1eadf17`
- Full Vitest suite: 192 files passed, 1 fixture-dependent file skipped; 689 tests passed, 9 skipped.
- TypeScript: `npm run typecheck` passed.
- ESLint: `npm run lint` passed.
- Production bundle: `npm run build` passed. Vite reported only the existing dependency externalisation and large-chunk advisories.
- Focused Operations/navigation/settings/campaign suite: 34 tests passed.
- Provider workflow contract: verifies that `provider-status` is deployed by the production Supabase workflow.
- Transactional SQL contracts: pull-request CI executes the retry/history transaction plus a two-session retry race against a local Supabase stack before merge. The transaction checks non-member and non-owner denial; the race proves concurrent clicks create exactly one child attempt. Local execution requires Docker/Podman and is therefore delegated to the Linux runner.

## Behaviour accepted by automated tests

1. Imported Outlook HTML removes malformed leading Sent/Subject metadata while preserving legitimate body text and extracting a clean subject.
2. Template editing and preview use the same saved HTML; preview rendering is sandboxed and the wider responsive editor prevents unnecessary two-axis scrolling.
3. Campaign reporting exposes every recipient and delivery attempt, including distinct historical statuses, queued/attempted/sent/failed/blocked timestamps, retry lineage, provider identifiers, and the exact stored content snapshot.
4. Contact details expose their linked outbound email history and stored content.
5. Manual retry is limited to definitive failed sends with no provider message ID, preserves the failed attempt, creates one idempotent child attempt, and keeps user/workspace ownership checks.
6. Provider telemetry is best effort and cannot turn a successful provider action into a failed CRM action.
7. Brevo account and rate-window values are labelled provider reported; Microsoft, Serper, and NVIDIA values are labelled CRM tracked. Missing data is Unknown, never zero.
8. A fresh definitive unhealthy Brevo check blocks campaign queueing with remediation. Stale or unavailable telemetry does not create a false block.
9. Sales CRM storage capacity is rendered in Operations and removed from the Sales dashboard only. Legacy dashboard storage remains unchanged.
10. Retrying stored HTML does not append a second unsubscribe footer, and provider-health cache entries are bound to a one-way credential fingerprint so replacing a Brevo key cannot reuse the old key's result.

## Production acceptance checklist

After the feature is merged and the exact merge SHA is deployed:

1. Confirm the Supabase workflow applied `20261011120000_email_delivery_operations.sql` and deployed `provider-status`, `process-email-queue`, `enrich-crm-company`, and `parse-quote`.
2. Open a previously imported Outlook HTML template. Confirm the Subject field is clean, Sent/Subject metadata is absent from the body, edits save, and the preview matches the saved email without horizontal scrolling at desktop width.
3. Open the known failed Brevo campaign. Expand its recipient ledger and confirm the friendly failure reason, status/timestamps, stored content preview, and retry eligibility.
4. Open the affected contact and confirm the same send is present in Email history with matching content.
5. Open Operations and confirm Delivery health, Brevo provider-reported status, CRM-tracked Microsoft/Serper/NVIDIA usage, configurable budgets, and storage capacity.
6. Confirm Storage capacity is absent from the Sales dashboard and remains present in the Legacy dashboard.
7. Use Settings > Check Brevo connection. If Brevo reports an unrecognised IP, confirm the remediation appears and queueing is blocked only while that fresh result is authoritative.
8. Check the template editor and Operations layout in both light/dark themes and at desktop/mobile widths.

Do not send a real campaign during acceptance unless the operator has selected a controlled recipient and explicitly intends to send it. Manual retry is also a real send operation and is not required for a read-only smoke test.

## Release evidence

- Feature PR: [#61](https://github.com/LeDoNguyenTu/QuotePulse-CRM/pull/61), squash merge `f39e26607a99ec6c14f059425ca6515a04ef932d`.
- RLS performance follow-up: [#62](https://github.com/LeDoNguyenTu/QuotePulse-CRM/pull/62), squash merge `2d2946c822bf1e0e3acaf5d7ff77b3caeee78eeb`.
- Exact-SHA production workflow: [GitHub Actions run 38136110670](https://github.com/LeDoNguyenTu/QuotePulse-CRM/actions/runs/38136110670) passed quality, fresh local-Supabase database contracts, migration/function deployment, all hosted transactional security/performance tests, storage-controller enablement, and archive-schedule verification.
- Vercel production deployment `dpl_5WaprK8nGJwAPNczWzQkDXyKjrTK` is Ready and serves the `https://quote-pulse-crm.vercel.app` alias.
- Linked migration parity was verified after deployment: `20261011120000_email_delivery_operations.sql` and `20261011193500_optimize_email_operations_rls.sql` are both recorded remotely.
- Direct read-only production checks confirmed `crm_campaign_recipient_reporting`, `crm_contact_email_history`, `crm_retry_failed_email_send(uuid,uuid)`, and `provider_status_cache.credential_fingerprint`; the live count of unoptimised public `auth.uid()` RLS policies is zero.
- `provider-status` is ACTIVE at version 2; `process-email-queue` is ACTIVE at version 92; `enrich-crm-company` is ACTIVE at version 33; `parse-quote` is ACTIVE at version 95.
- Authenticated production visual acceptance completed on 11 October 2026 against the operator's signed-in Chrome session. No real email or retry was triggered.
- Navigation verified: opening Tools automatically collapsed Outreach, and route navigation collapsed the open menu. Operations, Templates, Email Campaigns, and Contacts were reachable from the expected navigation groups.
- Operations verified: queue `0 waiting`; the known failed Brevo send was visible; Outlook, Serper, and NVIDIA showed their labelled tracking sources; storage loaded as Supabase `73.5 MB / 500 MB` (`14.7%`) and Cloudflare R2 `329 MB / 10 GB` (`3.3%`, `42,014` objects). Recovery reported complete. The older archive-lease Gateway Timeout remains recorded for scheduler retry and does not contradict the completed recovery state.
- Brevo correctly reported unhealthy because the deployment IPv6 address is not on the Brevo authorised-IP list. The failed send remained blocked and traceable; no retry was clicked.
- Campaign reporting verified the `Testing campaign` recipient ledger, failed state, attempt number, queued date, full provider error, stored subject/content preview, technical-details control, and retry control.
- Contact `TESTING` verified the same immutable failed send under Email history with matching campaign, address, attempt, timestamp, provider error, content-preview control, and retry control.
- The HTML template editor opened as a wide modal without the former top white-line defect. Its Subject field was clean, and the live preview omitted the malformed leading Sent/Subject metadata while preserving the formatted HTML body and hosted images. The historical failed-send snapshot still displays the exact older payload, as required for auditability.
- The inspected production pages emitted no browser console warnings or errors.
