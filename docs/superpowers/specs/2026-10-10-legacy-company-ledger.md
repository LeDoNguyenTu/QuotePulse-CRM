# Legacy company ledger design

## Outcome

The R2-backed QuotePulse Legacy dashboard returns to a company-centred ledger. Each company remains the parent record and expands in-place to show every archived contact and deal linked by `company_id`. The three record types are no longer presented as disconnected tabs.

## User experience

- Keep the existing Legacy workspace header, dark/light theme, company search, company columns, archive timestamp, pagination, and read-only notice.
- Replace the Companies / Deals / Contacts tabs with one company ledger.
- Add a calm `Contacts & deals` disclosure to each company row. The expanded full-width row contains two compact tables: contacts first, then deals.
- Each related record has its own `Restore to edit` action. Restoring remains explicit and uses the existing warning; browsing never restores or changes customer data.
- While the one-time relationship index is being prepared, the expanded row shows exact progress and remains usable. An empty linked section says that no linked records were archived.
- Visual tokens remain QuotePulse-native: existing brand navy and mint accents, existing sans typography, current table density, and an indented relationship rail. No new ornamental cards or animation.

## Data design

Archived contacts and deals already retain `company_id`, but their R2 objects are ordered by record ID. Add `company_bloom` to `workspace_archive_objects`: a versioned, fixed-size Bloom filter containing the `company_id` values present in each contact/deal object. It is derived metadata only; archived customer fields remain exclusively in R2.

New archives write the filter with each verified object. Existing verified archives are indexed resumably in bounded batches. Invalid or unknown Bloom data must fail open for lookup (read the object) rather than hiding a possible relationship.

The authenticated `workspace-archive` function adds:

- `prepare_relationships`: owner-scoped, idempotently indexes one bounded batch and returns progress.
- `company_bundle`: prepares a batch until ready, then uses Bloom candidates, checksum verification, exact `company_id` matching, safe projection, and signed restore cursors to return related contacts and deals.

## Security and invariants

- Existing legacy-workspace owner checks, archive status checks, R2 pointer scope, payload identity, checksum verification, field allow-lists, and signed cursors remain mandatory.
- The service-role Edge Function explicitly scopes every metadata query by archive and workspace. Browser code never queries archive metadata directly.
- Bloom false positives may cause an extra verified R2 read; false negatives are forbidden. Corrupt metadata therefore falls back to reading the object.
- The feature is Legacy-only. Sales CRM routes and tables are unchanged.
- No live legacy row is recreated until the user confirms the existing selective restore warning.

## Verification

- Pure Bloom tests cover membership, non-membership, empty objects, invalid metadata, and deterministic encoding.
- Migration tests cover the constrained nullable column and service-role ownership model.
- Edge tests cover bounded preparation, exact relationship filtering, projection, and restore cursors.
- Component tests cover a single company sheet, disclosure behavior, index progress, linked contacts/deals, empty states, and child restore actions.
- Run the full test suite, typecheck, lint, build, exact-SHA Supabase deployment, and authenticated production smoke against the archived Legacy workspace.
