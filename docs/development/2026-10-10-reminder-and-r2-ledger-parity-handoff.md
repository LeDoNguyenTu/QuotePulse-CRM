# Reminder and R2 Ledger Parity Handoff

Date: 2026-10-10

Branch: `feat/reminder-archive-parity`

Base: `main` at `809e707169fed36fb6d960ddf28e937e98415b70`

## Delivered

- The task-reminder menu is controlled and closes after an outside click, Escape, route change, opening a record, snoozing, or dismissing a reminder.
- The verified R2 archive uses the live legacy ledger presentation for Companies, Deals, and Contacts: debounced search, configurable columns, familiar table density and hover states, live-style value/date formatting, paging, loading overlays, and empty states.
- Archive browse responses now expose the complete safe legacy-ledger field set, including source state, HubSpot timestamps, archive state, relationship IDs, and imported HubSpot property values. Deal properties previously moved to a separate cold R2 object are owner-scope checked, checksum verified, and hydrated before display or search. Ownership and internal search metadata remain excluded.
- The archive Columns menu reads the durable HubSpot field catalog, preserves human labels and null-field grouping, and saves independent R2 column preferences without changing the live ledger selection.
- A filtered archive request scans up to 12 verified workspace-archive objects per bounded call instead of two. It matches normalized fields before hydrating cold deal properties, so nested verified R2 reads are capped by the returned page size rather than every scanned row.
- Archived rows remain read-only. Selecting a row or **Restore to edit** opens the existing warning; only the selected record and required parent are restored, and conflicts never overwrite live data.

## Security and data-integrity boundaries

- The existing workspace-owner check, archive status gate, table allow-list, signed owner-scoped cursor, R2 pointer validation, payload identity check, and SHA-256 verification are unchanged.
- The browser still receives only explicitly allow-listed fields for Companies, Deals, and Contacts. `owner_id`, generated search data, authentication records, API credentials, token hashes, and excluded tables are not returned.
- Browse and search do not mutate Supabase or R2. The restore endpoint remains the only path from an archive row back to the live database.

## Local verification

- `npm test -- --run`: 178 files passed, 1 skipped; 641 tests passed, 9 skipped.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed; only the existing browser-polyfill and large-chunk advisories were reported.
- `deno check supabase/functions/workspace-archive/index.ts`: not available in this Windows environment because Deno is not installed. The archive primitives run in Vitest and the production Edge Function must be verified by the exact-SHA Supabase workflow after merge.

## Release evidence

- Pull request: pending.
- Merged SHA: pending.
- Supabase exact-SHA workflow: pending.
- Vercel production deployment: pending.
- Authenticated production smoke: pending.

## Production smoke checklist

1. Open the Sales CRM, open **reminders**, then verify outside click and Escape close it; repeat with Snooze or Dismiss only on a disposable reminder.
2. Switch to the Legacy workspace and select **R2 archive**.
3. Verify Companies, Deals, and Contacts load with the live-style table and Columns control.
4. Search each archived table and confirm the object-scan progress advances while rows remain read-only.
5. Select a row and confirm the restore warning appears. Cancel it; do not restore a customer record solely for smoke testing.
