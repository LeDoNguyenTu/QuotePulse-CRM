# Email delivery operations acceptance

## Scope

This acceptance record covers Outlook HTML template cleanup and editing, campaign-recipient delivery history, contact-linked email history, append-only manual retries, provider telemetry, the Sales CRM Operations module, Brevo preflight protection, and relocation of Sales storage capacity from Dashboard to Operations.

The Legacy workspace archive and storage experience is intentionally unchanged.

## Local acceptance evidence

- Branch: `feat/email-delivery-operations`
- Implementation commits: `38a2610`, `6091596`, `574d125`, `e2276ed`, `235022d`
- Full Vitest suite: 189 files passed, 1 fixture-dependent file skipped; 680 tests passed, 9 skipped.
- TypeScript: `npm run typecheck` passed.
- ESLint: `npm run lint` passed.
- Production bundle: `npm run build` passed. Vite reported only the existing dependency externalisation and large-chunk advisories.
- Focused Operations/navigation/settings/campaign suite: 34 tests passed.
- Provider workflow contract: verifies that `provider-status` is deployed by the production Supabase workflow.

## Behaviour accepted by automated tests

1. Imported Outlook HTML removes malformed leading Sent/Subject metadata while preserving legitimate body text and extracting a clean subject.
2. Template editing and preview use the same saved HTML; preview rendering is sandboxed and the wider responsive editor prevents unnecessary two-axis scrolling.
3. Campaign reporting exposes every recipient and delivery attempt, including queued, sent, failed, retry lineage, provider identifiers, timestamps, and the exact stored content snapshot.
4. Contact details expose their linked outbound email history and stored content.
5. Manual retry is limited to definitive failed sends with no provider message ID, preserves the failed attempt, creates one idempotent child attempt, and keeps user/workspace ownership checks.
6. Provider telemetry is best effort and cannot turn a successful provider action into a failed CRM action.
7. Brevo account and rate-window values are labelled provider reported; Microsoft, Serper, and NVIDIA values are labelled CRM tracked. Missing data is Unknown, never zero.
8. A fresh definitive unhealthy Brevo check blocks campaign queueing with remediation. Stale or unavailable telemetry does not create a false block.
9. Sales CRM storage capacity is rendered in Operations and removed from the Sales dashboard only. Legacy dashboard storage remains unchanged.

## Production acceptance checklist

After the feature is merged and the exact merge SHA is deployed:

1. Confirm the Supabase workflow applied `20261011120000_email_delivery_operations.sql` and deployed `provider-status`, `process-email-queue`, `enrich-kyc`, and `parse-quote`.
2. Open a previously imported Outlook HTML template. Confirm the Subject field is clean, Sent/Subject metadata is absent from the body, edits save, and the preview matches the saved email without horizontal scrolling at desktop width.
3. Open the known failed Brevo campaign. Expand its recipient ledger and confirm the friendly failure reason, status/timestamps, stored content preview, and retry eligibility.
4. Open the affected contact and confirm the same send is present in Email history with matching content.
5. Open Operations and confirm Delivery health, Brevo provider-reported status, CRM-tracked Microsoft/Serper/NVIDIA usage, configurable budgets, and storage capacity.
6. Confirm Storage capacity is absent from the Sales dashboard and remains present in the Legacy dashboard.
7. Use Settings > Check Brevo connection. If Brevo reports an unrecognised IP, confirm the remediation appears and queueing is blocked only while that fresh result is authoritative.
8. Check the template editor and Operations layout in both light/dark themes and at desktop/mobile widths.

Do not send a real campaign during acceptance unless the operator has selected a controlled recipient and explicitly intends to send it. Manual retry is also a real send operation and is not required for a read-only smoke test.

## Release evidence

Release evidence is completed after merge so it can record the immutable merge SHA, GitHub Actions run, Vercel production deployment, applied migration/function status, and authenticated observations without guessing.
