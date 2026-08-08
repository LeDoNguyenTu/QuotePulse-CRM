# Owner-safe imports and configurable columns

## Goal

Prevent private CRM data from appearing after an account switch, retain every readable HubSpot property, and let each user choose which columns they see without losing the existing default dashboard layout.

## Account isolation

All TanStack Query keys for private data include the authenticated user ID. A session transition cancels and clears private queries before the next account renders. This prevents a response or cached value obtained under one account from being reused by another account.

## Import retention

The importer keeps its normalized fields for filtering, sorting, and business logic. It also stores a JSON snapshot of every readable HubSpot property for each company, deal, and contact. A per-owner property catalogue stores field names, labels, types, groups, and ordering, including custom properties.

An import discovers the property schema, requests properties in safe chunks, and merges chunks into the snapshot. Existing deduplication remains keyed by `(owner_id, hubspot_deal_id)` and only unchanged records are skipped. When the stored schema version is behind the discovered schema, the existing one-click import automatically runs a resumable full-property backfill; it does not create duplicate rows.

## Display preferences

Current dashboard/company/deal/contact fields remain visible by default. Additional catalogued properties are hidden initially, available from a Columns control, and persisted as a per-user JSON preference in `user_settings`. Restore defaults removes the saved override. The dashboard stays sorted by the existing last-activity ordering.

## Performance

The importer continues its indexed owner-and-HubSpot-ID sync check. It removes redundant post-upsert ID reads, reuses a per-run cache for associated HubSpot objects and local companies, and batches property reads where the HubSpot API permits. It retains the existing resumable button-driven import loop.

## Visual identity

The Vite document includes a small QuotePulse SVG favicon so the tab no longer uses the browser fallback icon.
