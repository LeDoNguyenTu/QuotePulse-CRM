# Phase G email campaigns handoff

## Scope

- Workspace campaigns reuse the existing durable `email_sends` queue and provider worker.
- Audiences support explicit contacts, CRM search, and company-industry filters.
- Recipient selection is deterministic and deduplicated by normalized email.
- Each recipient stores immutable contact, company, industry, and address snapshots.
- Suppressed recipients remain observable as blocked; queued recipients receive unsubscribe tokens.
- Campaign reporting exposes queued, scheduled, sending, retrying, sent, deferred, blocked, and failed states.
- Existing templates and both Microsoft Graph and Brevo providers remain available.

## Security and operations

- Campaign tables are workspace scoped with member RLS.
- The queue RPC validates authentication, workspace membership, consent, provider, template ownership, and unsubscribe URL.
- The service-role worker retains owner filters and additionally filters campaign writes by workspace and campaign.
- Template rendering uses the recipient snapshot, avoiding cross-tenant CRM lookups.

## Verification

- `npm test -- --run`: 82 files, 335 tests passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed with the existing bundle-size warning.
- Supabase migration and Edge Function deployment require proof from the main-branch workflow.
