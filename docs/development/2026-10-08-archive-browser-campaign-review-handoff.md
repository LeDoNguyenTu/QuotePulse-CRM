# Archive browser and campaign review handoff

## Delivered behavior

- Legacy Companies, Deals, and Contacts can be browsed from the verified R2 archive without
  restoring the full database. Pages are bounded to two objects and 100 displayed rows.
- Signed cursors are scoped to the authenticated owner, workspace, archive, and table. Every R2
  object is pointer-contained, SHA-256 checked, and identity checked before rows are returned.
- Archived rows are read-only. Edit opens a warning and offers conflict-safe selective restore;
  contacts and deals restore their archived parent company in the same database transaction.
- Campaign recipients are explicit and persistent across search/industry changes. **Choose all
  matching** resolves the full current filter, unions/deduplicates it into the selection, and the
  selected panel supports individual removal and **Clear all**. The hard limit remains 5,000.
- Selecting a template creates a campaign-local HTML/text draft. Unsaved edits require
  confirmation before replacement. The composer previews recipient-personalized subject, HTML,
  and text and reports unresolved tokens. Queueing stores the reviewed snapshots and does not
  reread a template at send time.

## Release artifacts

- Migrations: `20261008234500_campaign_content_snapshots.sql` and
  `20261009020000_restore_archived_record.sql`.
- Edge Function: `workspace-archive` gains `browse`, `record`, and `restore_record` actions.
- Frontend: legacy Dashboard Live/Archived mode; campaign message editor and persistent recipient
  picker.
- Rollback: the frontend can be reverted independently. The additive columns/RPC overload and
  private restore RPC may remain safely; removing them requires first reverting all callers.

## Verification

Run from the repository root:

```powershell
npm test -- --run
npm run typecheck
npm run lint
npm run build
npx supabase migration list --linked
npx supabase db push --linked --dry-run
```

Production acceptance must verify the exact merged SHA, confirm both migrations are present,
confirm `workspace-archive` is deployed with JWT verification enabled, browse a known archived
record without changing live counts, and restore one controlled record while confirming the R2
object inventory/checksum is unchanged. Do not send a real campaign during acceptance unless a
controlled recipient is chosen and the operator confirms at action time.

## Known limits

- Browse/search covers Companies, Deals, and Contacts only. Other archived tables remain internal
  dependencies and are available through full archive restore.
- Search is intentionally bounded; use **Continue** to scan the next verified objects.
- The local Windows host has no Deno binary. Deno typechecking must be confirmed by CI/Supabase
  deployment before production acceptance.
