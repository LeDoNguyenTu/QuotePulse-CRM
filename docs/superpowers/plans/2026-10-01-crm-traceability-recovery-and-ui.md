# CRM Traceability, Recovery, and UI Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver complete CRM column customization, stable search, visible relationships and provenance, correct workbook activity round trips, PST contact/source persistence, enrichment, and archive-first 30-day deletion recovery, including the compact-logo defect.

**Architecture:** Keep normalized CRM records and bounded searchable metadata in workspace-scoped Supabase tables. Store arbitrary workbook rows, PST bodies, and recoverable deletion graphs as verified private R2 objects referenced by compact manifests. Deliver the work as independently deployable UI, provenance, activity, enrichment/PST, and recovery slices.

**Tech Stack:** React 18, TypeScript, TanStack Query 5, Supabase/Postgres/RLS, Supabase Deno Edge Functions, private Cloudflare R2, Vitest, Testing Library, Vite.

**Spec:** `docs/superpowers/specs/2026-10-01-crm-traceability-recovery-and-ui-design.md`

## Global Constraints

- Preserve workspace isolation on every browser query, RPC, service-role query, foreign key, and R2 object key.
- Keep existing CRM records and imports readable throughout incremental deployment.
- Keep the raw PST local; only parsed, bounded content may be archived.
- Do not overwrite user/imported values with classifier or enrichment values.
- Archive upload, read-back verification, and manifest creation must succeed before hot rows are deleted.
- Restore availability is 30 days; permanent purge removes the R2 object before its manifest.
- Preserve unknown workbook cells and formatting; only explicitly assigned activity cells may change.
- Do not claim deployed or production behavior without direct evidence.

## Review Focus

- A saved column preference containing a removed/unknown column must be sanitized without hiding all columns; pin this in Task 2.
- A source shared by records with other lineage must detach only its own data and preserve the shared records; pin this in Task 7.
- Rapidly typing and then clearing search must not allow an older request to replace the clear result; pin this in Task 1.
- An R2 upload that succeeds but fails checksum verification must leave every hot row untouched; pin this in Task 7.
- Multiple activities assigned to one workbook cell must export deterministically without discarding older entries; pin this in Task 4.

---

### Task 1: Compact logo and stable debounced searches

**Files:**
- Create: `src/hooks/useDebouncedValue.ts`
- Create: `src/hooks/useDebouncedValue.test.tsx`
- Modify: `src/styles/index.css:174-210,520-588`
- Modify: `src/components/WorkspaceBrand.tsx`
- Modify: `src/pages/crm/CrmEmailCampaigns.tsx`
- Modify: `src/hooks/crm/useCrmCampaigns.ts`
- Modify: `src/hooks/crm/usePstExtractor.ts`
- Modify: `src/pages/crm/CrmPstExtractor.tsx`
- Test: `src/pages/WorkspaceSelector.test.tsx`
- Test: `src/pages/crm/CrmEmailCampaigns.test.tsx`
- Test: `src/pages/crm/CrmFileUploadControls.test.tsx`

**Interfaces:**
- Produces: `useDebouncedValue<T>(value: T, delayMs?: number): T`.
- Produces: campaign and PST hooks that accept settled search text and retain prior results while fetching.

- [ ] **Step 1: Write failing debounce and compact-brand regression tests**

```tsx
it('publishes only the latest value after the delay', () => {
  vi.useFakeTimers();
  const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 250), { initialProps: { value: 'a' } });
  rerender({ value: 'ab' });
  rerender({ value: '' });
  act(() => vi.advanceTimersByTime(250));
  expect(result.current).toBe('');
});

it('marks compact brand artwork as contained and unclipped', () => {
  expect(renderToStaticMarkup(<WorkspaceBrand kind="sales_crm" compact />)).toContain('workspace-brand__image--compact');
});
```

- [ ] **Step 2: Run focused tests and verify they fail**

Run: `npm test -- src/hooks/useDebouncedValue.test.tsx src/pages/WorkspaceSelector.test.tsx src/pages/crm/CrmEmailCampaigns.test.tsx src/pages/crm/CrmFileUploadControls.test.tsx`

Expected: FAIL because `useDebouncedValue` and the compact image class do not exist.

- [ ] **Step 3: Implement debounce, retained query data, and responsive logo sizing**

```ts
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}
```

Use `placeholderData: keepPreviousData` for campaign/PST search queries. Render a compact updating status from `isFetching`. Set the compact wrapper to a non-clipping fixed box no larger than `4.75rem × 2.25rem`, and keep selector-page brand rules scoped to non-compact brands.

- [ ] **Step 4: Run focused tests and rendered viewport checks**

Run: `npm test -- src/hooks/useDebouncedValue.test.tsx src/pages/WorkspaceSelector.test.tsx src/pages/crm/CrmEmailCampaigns.test.tsx src/pages/crm/CrmFileUploadControls.test.tsx`

Expected: PASS. Capture authenticated header screenshots at 320, 375, 768, 1024, and 1440 CSS pixels; the full mark must remain visible and the desktop header must not grow.

- [ ] **Step 5: Commit the slice**

```bash
git add src/hooks/useDebouncedValue.ts src/hooks/useDebouncedValue.test.tsx src/styles/index.css src/components/WorkspaceBrand.tsx src/pages/crm/CrmEmailCampaigns.tsx src/hooks/crm/useCrmCampaigns.ts src/hooks/crm/usePstExtractor.ts src/pages/crm/CrmPstExtractor.tsx src/pages/WorkspaceSelector.test.tsx src/pages/crm/CrmEmailCampaigns.test.tsx src/pages/crm/CrmFileUploadControls.test.tsx
git commit -m "fix: stabilize CRM search and compact branding"
```

### Task 2: Complete and persist CRM columns

**Files:**
- Modify: `src/lib/crm/tableColumns.ts`
- Modify: `src/lib/tablePreferences.ts`
- Modify: `src/lib/tablePreferences.test.ts`
- Modify: `src/components/ColumnSelector.tsx`
- Modify: `src/components/crm/CrmColumnPicker.tsx`
- Modify: `src/pages/crm/CrmCompanies.tsx`
- Modify: `src/pages/crm/CrmContacts.tsx`
- Modify: `src/pages/crm/CrmDeals.tsx`
- Modify: `src/lib/crm/types.ts`
- Test: `src/components/crm/CrmColumnPicker.test.tsx`

**Interfaces:**
- Produces: grouped `CrmColumnOption` with `group: 'main' | 'additional' | 'source'`.
- Produces: `resolveWorkspaceVisibleColumns(table, workspaceId, preferences, allowedIds)` and versioned preference writes.

- [ ] **Step 1: Write failing tests for complete options and safe preference migration**

```ts
expect(CRM_COLUMN_OPTIONS.crm_contacts.map((item) => item.id)).toEqual(expect.arrayContaining([
  'full_name', 'company', 'job_title', 'email', 'phone', 'created_at', 'updated_at', 'source', 'deal_count', 'task_count',
]));
expect(resolveWorkspaceVisibleColumns('crm_contacts', 'w1', legacy, ['full_name', 'email'])).toEqual(['full_name', 'email']);
expect(resolveWorkspaceVisibleColumns('crm_contacts', 'w1', { version: 2, workspaces: { w1: { crm_contacts: ['missing'] } } }, ['full_name'])).toEqual(['full_name']);
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- src/lib/tablePreferences.test.ts src/components/crm/CrmColumnPicker.test.tsx`

Expected: FAIL because additional fields and workspace-aware preference helpers are missing.

- [ ] **Step 3: Implement grouped picker, search, sanitization, and list rendering**

```ts
export interface VersionedTableColumnPreferences {
  version: 2;
  workspaces: Record<string, Partial<Record<CrmConfigurableTable, string[]>>>;
}
```

Read legacy flat keys as fallback, filter saved IDs against the current option set, and fall back to defaults when no valid selection remains. Add normalized timestamp/source/count columns to the three table renderers while retaining the existing compact defaults.

- [ ] **Step 4: Run column and list tests**

Run: `npm test -- src/lib/tablePreferences.test.ts src/components/crm/CrmColumnPicker.test.tsx src/pages/SalesWorkspacePage.test.tsx`

Expected: PASS with grouped options, saved workspace choices, and unknown preference recovery.

- [ ] **Step 5: Commit the slice**

```bash
git add src/lib/crm/tableColumns.ts src/lib/tablePreferences.ts src/lib/tablePreferences.test.ts src/components/ColumnSelector.tsx src/components/crm/CrmColumnPicker.tsx src/pages/crm/CrmCompanies.tsx src/pages/crm/CrmContacts.tsx src/pages/crm/CrmDeals.tsx src/lib/crm/types.ts src/components/crm/CrmColumnPicker.test.tsx
git commit -m "feat: expose complete CRM column choices"
```

### Task 3: Source filters, relationship counts, and original workbook columns

**Files:**
- Create: `src/lib/crm/sourceFilters.ts`
- Create: `src/lib/crm/sourceFilters.test.ts`
- Create: `src/components/crm/CrmSourceBadge.tsx`
- Create: `supabase/functions/crm-source-rows/index.ts`
- Create: `supabase/functions/crm-source-rows/index.test.ts`
- Create: the timestamped migration returned by `supabase migration new crm_source_filters_and_counts`
- Create: a contract test beside that generated migration using the same version prefix
- Modify: `supabase/functions/crm-workbook-template/index.ts`
- Modify: `src/hooks/crm/useCrmImports.ts`
- Modify: `src/lib/crm/resources.ts`
- Modify: `src/hooks/crm/useCrmResource.ts`
- Modify: `src/pages/crm/CrmCompanies.tsx`
- Modify: `src/pages/crm/CrmContacts.tsx`
- Modify: `src/pages/crm/CrmDeals.tsx`
- Modify: `src/lib/crm/detailQueries.ts`
- Modify: `src/components/crm/CrmDetailContent.tsx`

**Interfaces:**
- Produces: `CrmSourceFilter = { id: string; databaseId: string; filename: string; type: 'workbook' | 'pst' }`.
- Produces: `functions.getCrmSourceRows({ workspace_id, source_import_id, row_numbers, headers })`.
- Produces: list RPCs returning `source_count`, `primary_source`, `deal_count`, and `task_count` without N+1 queries.

- [ ] **Step 1: Write failing source-filter, containment, and count tests**

```ts
expect(toggleSourceFilter(null, source)).toEqual(source);
expect(clearSourceFilter(source)).toBeNull();
expect(() => assertWorkbookRowIndexPointer('owners/other/source.json.gz', owner, workspace, sourceId)).toThrow(/outside/);
```

The SQL test must create two workspaces and prove that a source ID from workspace B returns zero rows from workspace A's list RPC.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- src/lib/crm/sourceFilters.test.ts supabase/functions/crm-source-rows/index.test.ts`

Expected: FAIL because the source-filter helpers and Edge Function do not exist.

- [ ] **Step 3: Generate the migration and implement source-aware list RPCs**

Run: `npx supabase migration new crm_source_filters_and_counts`

Add security-invoker RPCs per resource with `p_workspace_id`, `p_source_import_id`, search/filter/sort, offset, and limit parameters. Join distinct source references, aggregate counts, validate membership, and keep deterministic UUID tie-break ordering. Grant execute only to `authenticated`.

- [ ] **Step 4: Persist and serve a verified R2 workbook row index**

Upload `source-row-index.v1.json.gz` alongside the template with headers and `{ row_number, cells }` entries. Store its key/checksum in `crm_source_imports.source_metadata`. The read function verifies JWT, membership, pointer scope, checksum, requested row count, and requested headers before returning values.

- [ ] **Step 5: Add source badges, filter banner, Clear filter, and detail task links**

Clicking a badge sets the source filter and resets page 1. The active banner includes the filename and Clear filter. Original workbook columns appear in the picker only for the active workbook source and render values returned by `crm-source-rows`.

- [ ] **Step 6: Run focused frontend, function, migration, and SQL tests**

Run: `npm test -- src/lib/crm/sourceFilters.test.ts src/lib/crm/resources.test.ts src/lib/crm/detailQueries.test.ts src/components/crm/CrmDetailContent.test.tsx supabase/functions/crm-source-rows/index.test.ts`

Run the generated migration test and `supabase/tests/sales_crm_isolation.sql` against local Postgres.

Expected: all PASS; cross-workspace source IDs expose no data.

- [ ] **Step 7: Commit the slice**

```bash
git add src/lib/crm/sourceFilters.ts src/lib/crm/sourceFilters.test.ts src/components/crm/CrmSourceBadge.tsx supabase/functions/crm-source-rows supabase/functions/crm-workbook-template/index.ts supabase/migrations src/hooks/crm/useCrmImports.ts src/lib/crm/resources.ts src/hooks/crm/useCrmResource.ts src/pages/crm src/lib/crm/detailQueries.ts src/components/crm/CrmDetailContent.tsx
git commit -m "feat: add CRM source filtering and workbook columns"
```

### Task 4: Activity timeline and explicit workbook destinations

**Files:**
- Create: `src/lib/crm/activityExport.ts`
- Create: `src/lib/crm/activityExport.test.ts`
- Generate migration: `crm_activity_export_destinations`
- Modify: `src/components/crm/CrmActivityComposer.tsx`
- Modify: `src/components/crm/CrmActivityComposer.test.tsx`
- Modify: `src/components/crm/CrmDetailContent.tsx`
- Modify: `src/components/crm/CrmDetailContent.test.tsx`
- Modify: `src/hooks/crm/useCrmActivities.ts`
- Modify: `src/hooks/crm/useCrmImports.ts`
- Modify: `src/lib/crm/importExport.ts`
- Modify: `src/lib/crm/importExport.test.ts`
- Modify: `src/styles/index.css`

**Interfaces:**
- Produces: `ActivityDestination = { sourceImportId: string; sourceRowNumber: number; sourceColumn: string } | null`.
- Produces: `combineWorkbookActivities(activities): string` using occurred-at then UUID ordering.

- [ ] **Step 1: Write failing destination and multi-activity export tests**

```ts
expect(combineWorkbookActivities([
  { id: 'b', body: 'Second', occurred_at: '2026-10-01T02:00:00Z' },
  { id: 'a', body: 'First', occurred_at: '2026-10-01T01:00:00Z' },
])).toBe('[01 Oct 2026, 10:00 am] Second\n\n[01 Oct 2026, 9:00 am] First');
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- src/lib/crm/activityExport.test.ts src/lib/crm/importExport.test.ts src/components/crm/CrmActivityComposer.test.tsx src/components/crm/CrmDetailContent.test.tsx`

- [ ] **Step 3: Generate migration and enforce destination ownership**

Run: `npx supabase migration new crm_activity_export_destinations`

Add an authenticated security-invoker RPC that verifies source import, source reference, record target, row number, and mapped activity column before inserting the activity destination. Reject mismatches with `22023` and cross-workspace access with `42501`.

- [ ] **Step 4: Implement composer destination controls, timeline layout, and deterministic export**

Render author/source/task metadata in stable wrapping cards. Load available destinations from record lineage. Export all explicitly assigned activities for the exact row/column using `combineWorkbookActivities`; preserve untouched cells when no destination exists.

- [ ] **Step 5: Run workbook fixture and UI tests**

Run: `npm test -- src/lib/crm/activityExport.test.ts src/lib/crm/importExport.test.ts src/lib/crm/workbookRoundTrip.test.ts src/components/crm/CrmActivityComposer.test.tsx src/components/crm/CrmDetailContent.test.tsx`

Expected: PASS; multiple assigned activities survive export in deterministic order.

- [ ] **Step 6: Commit the slice**

```bash
git add src/lib/crm/activityExport.ts src/lib/crm/activityExport.test.ts supabase/migrations src/components/crm/CrmActivityComposer.tsx src/components/crm/CrmActivityComposer.test.tsx src/components/crm/CrmDetailContent.tsx src/components/crm/CrmDetailContent.test.tsx src/hooks/crm/useCrmActivities.ts src/hooks/crm/useCrmImports.ts src/lib/crm/importExport.ts src/lib/crm/importExport.test.ts src/styles/index.css
git commit -m "feat: round trip assigned CRM activities"
```

### Task 5: Industry provenance and bounded company enrichment

**Files:**
- Create: `src/lib/crm/companyEnrichment.ts`
- Create: `src/lib/crm/companyEnrichment.test.ts`
- Create: `supabase/functions/enrich-crm-company/index.ts`
- Create: `supabase/functions/enrich-crm-company/index.test.ts`
- Generate migration: `crm_company_field_provenance`
- Modify: `supabase/functions/_shared/industry.ts`
- Modify: `src/lib/crm/importPreview.ts`
- Modify: `src/lib/crm/importPreview.test.ts`
- Modify: `src/pages/crm/CrmCompanies.tsx`
- Modify: `src/components/crm/CrmDetailContent.tsx`
- Modify: `src/lib/functions.ts`

**Interfaces:**
- Produces: `classifyMissingIndustry(name, current): { value: string | null; source: 'classifier' | null }`.
- Produces: authenticated `enrich-crm-company` request `{ workspace_id, company_ids }` capped at 25 IDs.

- [ ] **Step 1: Write failing classification precedence tests**

```ts
expect(classifyMissingIndustry('SUNLEY M&E ENGINEERING', null)).toEqual({ value: 'Engineering', source: 'classifier' });
expect(classifyMissingIndustry('SUNLEY M&E ENGINEERING', 'Construction')).toEqual({ value: 'Construction', source: null });
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- src/lib/crm/companyEnrichment.test.ts src/lib/crm/importPreview.test.ts supabase/functions/enrich-crm-company/index.test.ts`

- [ ] **Step 3: Generate provenance migration and implement import classification**

Run: `npx supabase migration new crm_company_field_provenance`

Store per-field source labels with constrained JSON or columns and prevent classifier/enrichment writes from replacing `user` or `workbook` values.

- [ ] **Step 4: Implement workspace-scoped enrichment function and UI actions**

Reuse the existing KYC search parsing, but scope all reads and updates by workspace and verified membership. Fill blank fields only, cap each call at 25 companies, and return per-record successes/errors rather than `ok: true` on total failure.

- [ ] **Step 5: Run focused tests and commit**

Run: `npm test -- src/lib/crm/companyEnrichment.test.ts src/lib/crm/importPreview.test.ts supabase/functions/enrich-crm-company/index.test.ts`

```bash
git add src/lib/crm/companyEnrichment.ts src/lib/crm/companyEnrichment.test.ts supabase/functions/enrich-crm-company supabase/functions/_shared/industry.ts supabase/migrations src/lib/crm/importPreview.ts src/lib/crm/importPreview.test.ts src/pages/crm/CrmCompanies.tsx src/components/crm/CrmDetailContent.tsx src/lib/functions.ts
git commit -m "feat: classify and enrich CRM companies"
```

### Task 6: PST archives, contact creation, provenance, and deletion controls

**Files:**
- Create: `supabase/functions/crm-mailbox-archive/index.ts`
- Create: `supabase/functions/crm-mailbox-archive/index.test.ts`
- Create: `supabase/functions/_shared/crmMailboxArchive.ts`
- Create: `supabase/functions/_shared/crmMailboxArchive.test.ts`
- Generate migration: `crm_pst_content_and_contacts`
- Modify: `src/workers/pst.worker.ts`
- Modify: `src/lib/pst/types.ts`
- Modify: `src/lib/pst/limits.ts`
- Modify: `src/lib/pst/safety.test.ts`
- Modify: `src/hooks/crm/usePstExtractor.ts`
- Modify: `src/pages/crm/CrmPstExtractor.tsx`

**Interfaces:**
- Produces: `PstMessageArchiveV1` containing source key, normalized addresses/display names, sanitized text body, and metadata.
- Produces: mailbox finalize RPC that verifies archive checksum/count before creating/matching contacts.

- [ ] **Step 1: Write failing body-limit, archive-containment, and contact-dedupe tests**

```ts
expect(sanitizePstBody('<script>x</script>Hello', 2000)).toBe('xHello');
expect(() => assertMailboxArchivePointer('owners/other/mail.json.gz', owner, workspace, importId)).toThrow(/outside/);
expect(uniqueEmails(['A@EXAMPLE.COM', 'a@example.com'])).toEqual(['a@example.com']);
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- src/lib/pst/safety.test.ts src/lib/pst/normalize.test.ts supabase/functions/_shared/crmMailboxArchive.test.ts supabase/functions/crm-mailbox-archive/index.test.ts`

- [ ] **Step 3: Generate migration and implement archive-verified PST finalize**

Run: `npx supabase migration new crm_pst_content_and_contacts`

Add bounded preview and R2 pointer/checksum columns, filename-aware search indexes, and source references for message-contact links. Match normalized email first; insert email-only contacts when absent; never duplicate a workspace email.

- [ ] **Step 4: Extend worker, save flow, search UI, and import/message controls**

Keep body bytes out of Postgres except a bounded plain-text preview. Display filename and folder on every result. Route delete actions into the recovery system from Task 7 rather than hard-deleting directly.

- [ ] **Step 5: Run focused tests and commit**

Run: `npm test -- src/lib/pst src/pages/crm/CrmFileUploadControls.test.tsx supabase/functions/_shared/crmMailboxArchive.test.ts supabase/functions/crm-mailbox-archive/index.test.ts`

```bash
git add supabase/functions/crm-mailbox-archive supabase/functions/_shared/crmMailboxArchive.ts supabase/functions/_shared/crmMailboxArchive.test.ts supabase/migrations src/workers/pst.worker.ts src/lib/pst src/hooks/crm/usePstExtractor.ts src/pages/crm/CrmPstExtractor.tsx
git commit -m "feat: preserve PST content and contact provenance"
```

### Task 7: Archive-first deletion and 30-day CRM recycle bin

**Files:**
- Create: `supabase/functions/crm-recovery/index.ts`
- Create: `supabase/functions/crm-recovery/index.test.ts`
- Create: `supabase/functions/_shared/crmRecovery.ts`
- Create: `supabase/functions/_shared/crmRecovery.test.ts`
- Create: `src/hooks/crm/useCrmRecovery.ts`
- Create: `src/pages/crm/CrmRecycleBin.tsx`
- Create: `src/components/crm/CrmDeleteSourceDialog.tsx`
- Create: `src/lib/crm/recovery.ts`
- Create: `src/lib/crm/recovery.test.ts`
- Generate migration: `crm_r2_recovery_manifests`
- Modify: `src/lib/workspaceNavigation.ts`
- Modify: `src/lib/crm/salesRoutes.ts`
- Modify: `src/pages/SalesWorkspacePage.tsx`
- Modify: `src/pages/crm/CrmImports.tsx`
- Modify: `src/pages/crm/CrmCompanies.tsx`
- Modify: `src/pages/crm/CrmContacts.tsx`
- Modify: `src/pages/crm/CrmDeals.tsx`
- Modify: `src/pages/crm/CrmPstExtractor.tsx`
- Modify: `supabase/functions/storage-maintenance/handler.ts`

**Interfaces:**
- Produces: `CrmDeletionPreview` with affected counts, detached shared counts, exact confirmation text, and expiry.
- Produces: `crm-recovery` actions `preview`, `archive-delete`, `restore`, `purge`, each idempotent by manifest ID.

- [ ] **Step 1: Write failing shared-lineage and archive-failure tests**

```ts
expect(planSourceDeletion({ sourceId: 's1', records: [{ id: 'c1', sourceIds: ['s1', 's2'] }] }).detach).toEqual(['c1']);
expect(planSourceDeletion({ sourceId: 's1', records: [{ id: 'd1', sourceIds: ['s1'] }] }).archive).toEqual(['d1']);
await expect(archiveThenDelete(depsWithChecksumMismatch, request)).rejects.toThrow(/checksum/);
expect(depsWithChecksumMismatch.deleteHotRows).not.toHaveBeenCalled();
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- src/lib/crm/recovery.test.ts supabase/functions/_shared/crmRecovery.test.ts supabase/functions/crm-recovery/index.test.ts`

- [ ] **Step 3: Generate manifest migration and SQL isolation/restore tests**

Run: `npx supabase migration new crm_r2_recovery_manifests`

Create workspace-scoped manifests with constrained states `building`, `verified`, `restoring`, `restored`, `purging`, `failed`; expiry defaults to `created_at + interval '30 days'`. RLS permits member reads and owner/admin mutations through authenticated functions. Add service-role-only state transition RPCs with expected-state checks.

- [ ] **Step 4: Implement preview and archive-delete state machine**

Serialize the exact source/record graph, upload gzip JSON, verify containment/checksum/counts by reading it back, insert/update the compact manifest, and only then delete or detach rows in a database transaction. Shared records lose only the target source reference.

- [ ] **Step 5: Implement idempotent restore and purge**

Restore validates workspace identity and composite foreign keys before upserting in dependency order. Purge deletes the R2 object first and then its manifest. Failures preserve retryable state and never claim completion.

- [ ] **Step 6: Implement typed-confirmation dialogs and recycle-bin UI**

The dialog must display filename/record name, affected counts, preserved-shared counts, expiry, and require an exact case-sensitive match. The recycle bin shows Restore and Delete permanently with distinct confirmations.

- [ ] **Step 7: Extend storage maintenance with bounded expiry processing**

Process at most 25 expired manifests per invocation, use leases/idempotent states, and leave failed R2 deletions retryable. Do not equate R2 archival with reclaimed PostgreSQL capacity.

- [ ] **Step 8: Run recovery, SQL, navigation, and UI tests**

Run: `npm test -- src/lib/crm/recovery.test.ts src/lib/workspaceNavigation.test.ts src/lib/crm/salesRoutes.test.ts supabase/functions/_shared/crmRecovery.test.ts supabase/functions/crm-recovery/index.test.ts supabase/functions/storage-maintenance/handler.test.ts`

Run the generated migration contract test plus `supabase/tests/workspace_isolation.sql` and `supabase/tests/sales_crm_isolation.sql`.

Expected: PASS; checksum mismatch performs no deletion, shared records survive source deletion, restore is idempotent, and purge ordering is R2-first.

- [ ] **Step 9: Commit the slice**

```bash
git add supabase/functions/crm-recovery supabase/functions/_shared/crmRecovery.ts supabase/functions/_shared/crmRecovery.test.ts supabase/functions/storage-maintenance/handler.ts supabase/functions/storage-maintenance/handler.test.ts supabase/migrations src/hooks/crm/useCrmRecovery.ts src/pages/crm/CrmRecycleBin.tsx src/components/crm/CrmDeleteSourceDialog.tsx src/lib/crm/recovery.ts src/lib/crm/recovery.test.ts src/lib/workspaceNavigation.ts src/lib/workspaceNavigation.test.ts src/lib/crm/salesRoutes.ts src/lib/crm/salesRoutes.test.ts src/pages/SalesWorkspacePage.tsx src/pages/crm
git commit -m "feat: add recoverable CRM source deletion"
```

### Task 8: Integrated verification and release evidence

**Files:**
- Modify only test fixtures or documentation required by verified integration behavior.

**Interfaces:**
- Consumes every earlier task's public interfaces.
- Produces a release-ready commit set with exact verification evidence.

- [ ] **Step 1: Run GitNexus change detection before final commits**

Run GitNexus `detect_changes` for all unstaged changes, inspect every affected flow, and perform symbol context/impact follow-up for any unexpected HIGH or CRITICAL path.

- [ ] **Step 2: Run the full local quality suite**

Run: `npm test`

Run: `npm run typecheck`

Run: `npm run lint`

Run: `npm run build`

Expected: every command exits 0 with no generated drift.

- [ ] **Step 3: Run database and Edge Function verification**

Run all migration contract tests, SQL isolation suites, Deno checks/tests for changed functions, and Supabase advisors supported by the installed CLI. Verify migration filenames use the generated 14-digit timestamp format.

- [ ] **Step 4: Run authenticated browser smoke and capture screenshots**

Exercise column persistence, original source columns, source filters/Clear filter, relationship navigation, timeline export assignment, company enrichment errors/success, PST contact/source search, typed deletion, recycle restoration, and compact logo widths. Capture actual screenshots rather than relying on DOM assertions.

- [ ] **Step 5: Validate release state before publishing**

Compare local migrations to remote history, confirm required R2 and search secrets without printing values, and verify the Vercel/GitHub deployment path. If Vercel CLI remains unavailable, report that limitation and recommend `npm i -g vercel`; use provider evidence available through the repository workflow instead of claiming CLI checks.

- [ ] **Step 6: Commit verification-only adjustments and prepare the release handoff**

Run `git status --short` and inspect the final diff. If integration verification
required fixture or documentation corrections, stage those exact files shown by
status and commit them as `test: verify CRM traceability and recovery`. Record
branch, final SHA, commands and exit codes, migration/function deployment
evidence, browser evidence, blockers, and rollback points.
