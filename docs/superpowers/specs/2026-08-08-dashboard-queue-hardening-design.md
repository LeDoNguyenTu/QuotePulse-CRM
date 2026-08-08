# Dashboard and Durable Email Queue Design

## Scope

Improve dashboard query performance and pagination, expose safe structured errors, and replace the browser-driven email drain with a durable, consent-aware scheduled queue. Microsoft Graph remains the default provider and Brevo is a complete optional provider. No production data, deployments, commits, pushes, or pull requests are part of this work.

## Dashboard data flow

`company_dashboard` remains a normal `security_invoker = true` view. Its replacement will aggregate deals, contacts, quote attachments, KYC profiles, and email history by `(owner_id, company_id)` before joining them once to non-deleted companies. The view will preserve the existing `CompanyDashboardRow` columns, exclude deleted companies, revoke `anon`, and grant only `authenticated` select access.

The dashboard will use separate React Query records:

- Page data has a key containing normalized filters, page, and page size; it requests only displayed columns, has no exact count, and orders by `last_deal_at DESC NULLS LAST`, `updated_at DESC`, then `id ASC`.
- Count has a key containing normalized filters and page size, but not page. It uses a cached head/count query.

The UI retains the prior page while loading the next page, displays a navigation overlay, disables repeated Next clicks, prefetches the next page when it exists, surfaces page and count errors separately, and clamps an invalid page after changed filters or deletion.

## Error normalization

A reusable normalizer converts native errors, PostgREST/Supabase objects, strings, nulls, and unknown values into a safe display shape with a primary message and optional code, details, hint, and status. It recursively redacts credentials and uses a bounded JSON fallback. `ErrorState` displays the message and a details disclosure. UI code and Edge Functions use the same redaction rules in runtime-appropriate modules.

## Durable email queue

The migration extends `email_sends` with provider, scheduled and retry timestamps, attempt count, lease fields, and state needed to show queued, scheduled, sending, retrying, sent, failed, and blocked messages. A hardened, service-role-only `SECURITY DEFINER` claim function uses `FOR UPDATE SKIP LOCKED`, sets a short lease, returns a bounded due batch, and protects its search path and grants. Every service-role query remains explicitly constrained to the row owner.

The browser uses an authenticated enqueue RPC and does not invoke a drain loop. The RPC normalizes recipients, rejects suppressions, reserves conservative timing from the selected cooldown, creates revocable opt-out tokens, and returns a summary. A scheduled Edge Function is invoked once per minute through `pg_cron` and `pg_net`; its authorization secret is read from Supabase Vault, never client code. The worker claims only due rows, processes a bounded batch, checks each owner’s settings and daily quota, and releases retryable rows with `Retry-After` or bounded exponential backoff. Ambiguous send outcomes do not automatically retry.

## Providers

Providers implement a common send contract returning a provider message id and retry classification. Microsoft Graph is the default and sends a plain-text MIME payload so List-Unsubscribe headers can be supplied. Brevo uses its documented transactional email API and only a server-side `BREVO_API_KEY`; it is optional in settings and explicitly presented as an expected/opted-in sending provider, not a bypass for provider rules or spam filtering.

## Consent and deliverability

New owner-scoped suppression rows store normalized addresses and a reason. An opaque random token is stored only as a hash with owner, recipient, expiry, and revocation metadata. The public unsubscribe function receives only this token, is idempotent, writes the suppression record, and never exposes user or recipient identifiers. Outreach bodies include an opt-out link. The UI uses conservative defaults, warns about aggressive limits, requires an explicit legitimate-recipient confirmation, and explains SPF, DKIM, DMARC, mailbox reputation, and the limitations of API-level cooldowns. No tracking pixels, hidden tracking, link rewriting, or spam-filter circumvention are included.

## Security boundaries

- RLS stays per-owner for browser access; browser inserts use `auth.uid()` defaults or authenticated RPCs.
- Service-role Edge Functions filter each read and write by `created_by` or `owner_id` and never infer ownership from an untrusted request.
- Queue claiming is callable only by `service_role`; it cannot be used by `anon` or `authenticated` roles.
- Cron authentication uses a Vault secret and a constant-time server-side comparison.
- Supabase API errors are redacted before display or persistence.

## Validation

Focused tests cover normalization, pagination keys/ranges/order, cooldown scheduling, daily limits, suppressions, token verification, claim SQL behavior, retry classification, owner isolation, and concurrent-worker safety. Query-plan evidence is collected only from a local Supabase fixture when the local stack is available; otherwise the exact commands and limitation are reported. Required commands are `npm install`, `npm run typecheck`, `npm run lint`, `npm run build`, and, when available, `supabase db reset`.
