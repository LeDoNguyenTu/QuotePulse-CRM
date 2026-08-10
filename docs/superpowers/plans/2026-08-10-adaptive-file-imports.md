# Adaptive File Imports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a separate adaptive spreadsheet-upload workspace that suggests CRM matches and only changes CRM records after a user-configured merge; add durable HubSpot links and explicit export scopes.

**Architecture:** The browser parses a workbook into arbitrary header/value JSON and saves it in owner-scoped upload tables. An authenticated Edge Function recomputes matches from the stored source data and applies merge policy, so browser target IDs are never trusted. Uploads use dedicated pages and do not invoke HubSpot sync.

**Tech Stack:** Vite, React 18, TypeScript, TanStack Query, React Router 6, Tailwind, SheetJS `xlsx`, Supabase Postgres/RLS, Supabase Edge Functions, Vitest, ExcelJS.

## Global Constraints

- Preserve per-file headers and values; never hard-code the sample workbook format.
- Match exact normalized email, then company name, then contact name plus company name.
- Require per-entity update/create policy and final confirmation before any CRM write.
- Every new row has `owner_id`; every service-role operation uses `.eq('owner_id', userId)`.
- Lock any file with successful merge writes from deletion in UI and database.
- Never store HubSpot signed download URLs; do not create previews for quote-object IDs.
- Preserve unrelated `AGENTS.md` and `CLAUDE.md` changes, use 14-digit migration names, and run build/typecheck plus focused tests.

---

### Task 1: Add uploaded-file tables, RLS, and deletion protection

**Files:**
- Create: `supabase/migrations/20260810110000_adaptive_uploaded_files.sql`
- Create: `supabase/tests/adaptive_uploaded_files.sql`
- Modify: `supabase/migrations/20260809114110_authenticated_data_api_grants.sql`
- Modify: `src/lib/types.ts`

**Interfaces:** Creates `uploaded_files`, `uploaded_file_rows`, and `uploaded_file_merges`; exposes `UploadedFile`, `UploadedFileRow`, `UploadedFileMerge`, `UploadColumnMapping`, and merge/match string unions.

- [ ] **Step 1: Write the failing SQL security test**

Create two synthetic owners, one source file, and a completed merge. Prove tenant isolation, Data API grants, and protected deletion:

```sql
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
delete from public.uploaded_files where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
-- expected: cannot delete an uploaded file after CRM records were merged
```

- [ ] **Step 2: Run test to verify it fails**

Run: `supabase test db supabase/tests/adaptive_uploaded_files.sql`

Expected: FAIL because tables, RLS policies, grants, and deletion guard are absent.

- [ ] **Step 3: Implement storage**

Add metadata (`file_name`, MIME type, selected sheet, `headers jsonb`, `mapping jsonb`, checked row count), row source `values jsonb` plus match/result fields, and merge policy/status/count/error fields. Add owner/file/status indexes, updated-at triggers, owner `using`/`with check` RLS, authenticated grants, and a before-delete trigger that rejects a file with completed/partial merge rows where `successful_row_count > 0`. Extend hand-written frontend database types.

- [ ] **Step 4: Run test to verify it passes**

Run: `supabase test db supabase/tests/adaptive_uploaded_files.sql`

Expected: PASS for isolation and deletion lock.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260810110000_adaptive_uploaded_files.sql supabase/tests/adaptive_uploaded_files.sql supabase/migrations/20260809114110_authenticated_data_api_grants.sql src/lib/types.ts
git commit -m "feat: add protected uploaded file storage"
```

### Task 2: Build adaptive workbook parsing and semantic mapping

**Files:**
- Modify: `package.json`, `package-lock.json`
- Create: `src/lib/uploadedFileWorkbook.ts`, `src/lib/uploadedFileWorkbook.test.ts`
- Create: `src/lib/uploadedFileMapping.ts`, `src/lib/uploadedFileMapping.test.ts`

**Interfaces:** `parseUploadedWorkbook(file): Promise<ParsedWorkbook>` returns sheets with ordered headers, preview, and JSON rows. `validateUploadMapping(mapping, headers)` validates optional roles: email, company name, first/last/full name, deal name/stage, and last activity date.

- [ ] **Step 1: Write failing tests**

```ts
it('keeps arbitrary xlsm-compatible headers and values', async () => {
  const parsed = await parseUploadedWorkbook(makeWorkbookFile('Prospects', [
    ['Email Address', 'Company name', 'Custom score'],
    ['person@example.com', 'Acme', 7],
  ]));
  expect(parsed.sheets[0].rows[0]).toEqual({
    'Email Address': 'person@example.com', 'Company name': 'Acme', 'Custom score': 7,
  });
});

it('rejects a mapping header absent from its file', () => {
  expect(validateUploadMapping({ email: 'Missing' }, ['Email Address']).error).toContain('Missing');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/uploadedFileWorkbook.test.ts src/lib/uploadedFileMapping.test.ts`

Expected: FAIL because parser, mapper, and `xlsx` are missing.

- [ ] **Step 3: Implement parser and mapping**

Add `xlsx`; accept `.xlsx`, `.xlsm`, and `.csv` only. Enforce 25 MB, 200 headers, 20,000 rows, and 32,000 characters/cell. Call `XLSX.read(bytes, { type: 'array', cellDates: true, bookVBA: false })`, never retain/execute macros, reject blank or duplicate normalized headers, preserve headers/order, produce JSON-safe values, and only suggest mapping by header synonyms for user review.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/uploadedFileWorkbook.test.ts src/lib/uploadedFileMapping.test.ts`

Expected: PASS for arbitrary headers, CSV, limits, duplicates, and mapping validation.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/lib/uploadedFileWorkbook.ts src/lib/uploadedFileWorkbook.test.ts src/lib/uploadedFileMapping.ts src/lib/uploadedFileMapping.test.ts
git commit -m "feat: parse adaptive spreadsheet uploads"
```

### Task 3: Implement deterministic matching and merge-policy helpers

**Files:**
- Create: `supabase/functions/_shared/uploadedFileMatch.ts`, `supabase/functions/_shared/uploadedFileMatch.test.ts`
- Create: `supabase/functions/_shared/uploadedFileMerge.ts`, `supabase/functions/_shared/uploadedFileMerge.test.ts`

**Interfaces:** `suggestMatch(row, mapping, indexes): MatchSuggestion` returns `matched`, `unmatched`, or `needs_review`; `planMerge(row, policy, match): RowMergePlan` returns `skip`, `update`, or `create`.

- [ ] **Step 1: Write failing precedence tests**

```ts
it('prefers normalized email over same-named company', () => {
  expect(suggestMatch(
    { Email: ' PERSON@EXAMPLE.COM ', Company: 'Acme' },
    { email: 'Email', companyName: 'Company' },
    indexesWithEmailContactAndAcmeCompany,
  )).toMatchObject({ status: 'matched', reason: 'email', targetType: 'contact' });
});

it('never updates an ambiguous record', () => {
  expect(planMerge(row, updateAndCreatePolicy, needsReviewMatch).operation).toBe('skip');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- supabase/functions/_shared/uploadedFileMatch.test.ts supabase/functions/_shared/uploadedFileMerge.test.ts`

Expected: FAIL because helpers are absent.

- [ ] **Step 3: Implement pure helpers**

Normalize email by trim/lowercase and names with Unicode normalization, punctuation/whitespace collapse, and lowercase. Return `needs_review` on ties. Implement policies `skip`, `update_matched`, `create_unmatched`, and `update_and_create` for each entity; never transfer unmapped source values into CRM fields.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- supabase/functions/_shared/uploadedFileMatch.test.ts supabase/functions/_shared/uploadedFileMerge.test.ts`

Expected: PASS for priority, ambiguity, and every policy.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/uploadedFileMatch.ts supabase/functions/_shared/uploadedFileMatch.test.ts supabase/functions/_shared/uploadedFileMerge.ts supabase/functions/_shared/uploadedFileMerge.test.ts
git commit -m "feat: plan uploaded file CRM matches"
```

### Task 4: Add the matching/merge Edge Function

**Files:**
- Create: `supabase/functions/uploaded-file-merge/index.ts`, `supabase/functions/uploaded-file-merge/index.test.ts`
- Modify: `supabase/config.toml`, `src/lib/functions.ts`

**Interfaces:** `functions.refreshUploadedFileMatches(fileId)` sends `{ action: 'match', file_id }`; `functions.mergeUploadedFile(fileId, policy)` sends `{ action: 'merge', file_id, policy }`; both return `{ ok, file_id, merge_id?, counts, errors }`.

- [ ] **Step 1: Write failing handler tests**

Inject a repository seam, then assert owner filtering, match-only persistence, merge-run creation, and total failure truthfulness:

```ts
expect(repository.calls).toContainEqual(expect.objectContaining({
  table: 'uploaded_files', filters: { id: FILE_ID, owner_id: OWNER_ID },
}));
expect(result).toMatchObject({ ok: false, counts: { failed: 1 } });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- supabase/functions/uploaded-file-merge/index.test.ts`

Expected: FAIL because the handler is absent.

- [ ] **Step 3: Implement actions**

Set `verify_jwt = true`. Authenticate using `getUserId`; load source, rows, and CRM indexes with owner filters. `match` saves only suggestions. `merge` validates policy/mapping, recomputes match, creates a running merge record, and applies plans. Explicitly set owner ID on all creates; select-then-insert with `23505` recovery for company/contact dedupe; save every row outcome; end as completed, partial, or failed and return `ok:false` on total failure.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- supabase/functions/uploaded-file-merge/index.test.ts supabase/functions/_shared/uploadedFileMatch.test.ts supabase/functions/_shared/uploadedFileMerge.test.ts`

Expected: PASS for isolation, policies, retry behavior, and errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/uploaded-file-merge/index.ts supabase/functions/uploaded-file-merge/index.test.ts supabase/config.toml src/lib/functions.ts
git commit -m "feat: merge uploaded files with explicit policies"
```

### Task 5: Add the independent Uploaded Files workspace

**Files:**
- Create: `src/hooks/useUploadedFiles.ts`
- Create: `src/lib/uploadedFileLinks.ts`, `src/lib/uploadedFileLinks.test.ts`
- Create: `src/pages/UploadedFiles.tsx`, `src/pages/UploadedFileDetail.tsx`
- Create: `src/components/UploadedFileTable.tsx`, `src/components/UploadedFileMergeModal.tsx`
- Modify: `src/App.tsx`, `src/components/Layout.tsx`

**Interfaces:** Adds protected routes `/uploaded-files` and `/uploaded-files/:id`; hook supports list/detail/create/mapping/delete/match/merge; `hubspotRecordUrl()` returns an external HubSpot record link or null.

- [ ] **Step 1: Write failing link/action tests**

```ts
it('builds a HubSpot company record URL', () => {
  expect(hubspotRecordUrl({ uiDomain: 'app.hubspot.com', portalId: '6561878', objectType: 'company', objectId: '123' }))
    .toBe('https://app.hubspot.com/contacts/6561878/record/0-2/123');
});

it('disables delete after successful merge writes', () => {
  expect(uploadedFileActions({ successfulMergeRows: 1 }).deleteDisabled).toBe(true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/uploadedFileLinks.test.ts`

Expected: FAIL because links/action state are absent.

- [ ] **Step 3: Implement workspace**

Add nav index with upload/Open/Delete. Upload Task 2 data after user chooses sheet/mapping, chunk row inserts, then refresh matches. Detail retains original headers/order and adds Match, Reason, CRM record, and Merge result; horizontal-scroll responsive table and text labels provide mobile/accessibility fallback. Use contact/company/deal object type IDs `0-1`/`0-2`/`0-3` for HubSpot records, local Company Detail as fallback. Merge modal chooses independent entity policy, summarizes counts, and final-confirms. Disable delete after success and display database guard errors for stale UI.

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test -- src/lib/uploadedFileLinks.test.ts && npm run typecheck`

Expected: PASS for links/actions and TypeScript routes/hooks.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useUploadedFiles.ts src/lib/uploadedFileLinks.ts src/lib/uploadedFileLinks.test.ts src/pages/UploadedFiles.tsx src/pages/UploadedFileDetail.tsx src/components/UploadedFileTable.tsx src/components/UploadedFileMergeModal.tsx src/App.tsx src/components/Layout.tsx
git commit -m "feat: add isolated uploaded file workspace"
```

### Task 6: Persist HubSpot account metadata and show durable file previews

**Files:**
- Modify: `supabase/migrations/20260810110000_adaptive_uploaded_files.sql`, `src/lib/types.ts`, `supabase/functions/_shared/supabaseAdmin.ts`
- Modify: `supabase/functions/_shared/hubspot.ts`, `supabase/functions/hubspot-ingest/index.ts`, `src/components/AttachmentList.tsx`
- Create: `supabase/functions/_shared/hubspotAccount.test.ts`, `src/lib/hubspotLinks.ts`, `src/lib/hubspotLinks.test.ts`

**Interfaces:** User settings gain portal/UI domain. `HubSpotClient.getAccountDetails()` returns them; `hubspotFilePreviewUrl(portalId, uiDomain, fileId)` returns navigation URL or null.

- [ ] **Step 1: Write failing account/link tests**

```ts
it('builds a permanent HubSpot file preview URL', () => {
  expect(hubspotFilePreviewUrl('6561878', 'app.hubspot.com', '213209249324'))
    .toBe('https://app.hubspot.com/file-preview/6561878/file/213209249324/');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/hubspotLinks.test.ts supabase/functions/_shared/hubspotAccount.test.ts`

Expected: FAIL because helpers and account metadata are absent.

- [ ] **Step 3: Implement tolerant metadata capture**

Request `/account-info/v3/details`, falling back to `/integrations/v1/me`; save validated portal ID/UI domain on sync and treat any failure as warning only. Render `Open in HubSpot` for a known file ID even when `file_url` is null. Retain public URL and parse-on-demand paths, and omit preview for quote object IDs.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/hubspotLinks.test.ts supabase/functions/_shared/hubspotAccount.test.ts supabase/functions/_shared/hubspotFiles.test.ts`

Expected: PASS for URL, domain fallback, scope failure tolerance, and existing feature flag.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260810110000_adaptive_uploaded_files.sql src/lib/types.ts supabase/functions/_shared/supabaseAdmin.ts supabase/functions/_shared/hubspot.ts supabase/functions/_shared/hubspotAccount.test.ts src/lib/hubspotLinks.ts src/lib/hubspotLinks.test.ts supabase/functions/hubspot-ingest/index.ts src/components/AttachmentList.tsx
git commit -m "feat: add HubSpot file preview navigation"
```

### Task 7: Add explicit whole-database and activity-range export scopes

**Files:**
- Create: `src/lib/exportScope.ts`, `src/lib/exportScope.test.ts`, `src/components/ExportScopeModal.tsx`
- Modify: `src/pages/Dashboard.tsx`, `src/lib/functions.ts`, `supabase/functions/export-xlsx/index.ts`
- Create: `supabase/functions/export-xlsx/index.test.ts`

**Interfaces:** `ExportScope = { mode: 'all' } | { mode: 'hubspot_activity_range'; from: string; to: string }`; `exportXlsx(scope)` returns a blob.

- [ ] **Step 1: Write failing tests**

```ts
it('requires start and end dates for activity export', () => {
  expect(validateExportScope({ mode: 'hubspot_activity_range', from: '2026-08-01', to: '' }).error)
    .toBe('Choose both a start and end date.');
});

it('uses the following UTC day for an inclusive end', () => {
  expect(exportFilters({ mode: 'hubspot_activity_range', from: '2026-08-01', to: '2026-08-31' }))
    .toMatchObject({ gte: '2026-08-01T00:00:00.000Z', lt: '2026-09-01T00:00:00.000Z' });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/exportScope.test.ts supabase/functions/export-xlsx/index.test.ts`

Expected: FAIL because export currently consumes dashboard filter state.

- [ ] **Step 3: Implement scope modal and server guard**

Replace current export with a modal defaulting to Entire CRM database; alternate option requires both activity dates. Send only explicit scope, preserve owner filtering, apply UTC start/next-day end only for range, reject malformed/partial/reversed range with 400, and name output for its scope.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/exportScope.test.ts supabase/functions/export-xlsx/index.test.ts && npm run typecheck`

Expected: PASS for whole database, inclusive interval, and invalid input.

- [ ] **Step 5: Commit**

```bash
git add src/lib/exportScope.ts src/lib/exportScope.test.ts src/components/ExportScopeModal.tsx src/pages/Dashboard.tsx src/lib/functions.ts supabase/functions/export-xlsx/index.ts supabase/functions/export-xlsx/index.test.ts
git commit -m "feat: add scoped CRM exports"
```

### Task 8: Verify flow, impact, and deployment readiness

**Files:** Modify only proven-defect files from Tasks 1-7.

- [ ] **Step 1: Run focused automation**

```bash
npm test -- src/lib/uploadedFileWorkbook.test.ts src/lib/uploadedFileMapping.test.ts supabase/functions/_shared/uploadedFileMatch.test.ts supabase/functions/_shared/uploadedFileMerge.test.ts supabase/functions/uploaded-file-merge/index.test.ts src/lib/hubspotLinks.test.ts src/lib/exportScope.test.ts supabase/functions/export-xlsx/index.test.ts
supabase test db supabase/tests/adaptive_uploaded_files.sql
```

Expected: PASS.

- [ ] **Step 2: Verify build**

Run: `npm run build && npm run typecheck`

Expected: exit 0 with no type errors.

- [ ] **Step 3: Verify the real flow**

Run `npm run dev`; upload the supplied `.xlsm`, choose `Table1_1`, confirm 22 headers, select mappings, inspect email-first match, confirm no CRM write before merge, perform a selected merge, verify Delete locks, open valid HubSpot preview, and export both scopes. Report unavailable local Supabase/HubSpot dependencies precisely.

- [ ] **Step 4: Run mandatory GitNexus checks before final commit**

Before each production-symbol edit call `gitnexus_impact({ target, direction: 'upstream', repo: 'Client' })` and report risk; before final commit run `gitnexus_detect_changes({ scope: 'all', repo: 'Client' })` and review HIGH/CRITICAL results.

- [ ] **Step 5: Commit verified fixes and deploy via CI**

```bash
git add <only verification-fix files>
git commit -m "test: verify adaptive file import workflow"
```

Verify remote migration history and deploy `uploaded-file-merge` through the existing GitHub Supabase workflow before production use.
