# Customer-file production acceptance — 2026-10-08

This checkpoint records the reproducible acceptance pass for the customer-supplied files in:

`C:\Users\ADMIN\OneDrive - Murdoch University\Ca-Meo Backup\Desktop\Customer files`

Raw workbooks, contact data, Outlook messages, and email images are intentionally excluded from Git. The automated verifier reads the approved local directory only when `CUSTOMER_FILES_DIR` is set. This document records file identity, aggregate results, and remaining live acceptance without exposing customer rows.

## Approved source inventory

| File | SHA-256 |
| --- | --- |
| `Current AMP customers.xlsx` | `b512ed00ad2a433afedef95a6c2297c7150565d0e18bf966f00dbeae0cce616c` |
| `Customer Contacts.xlsx` | `79b9798610e2428e599c6b1f22eb22ce86ee804492126bf6cb09146f917d48d2` |
| `Free 30-Day Trial of Microsoft 365 Copilot for Business.htm.html` | `95c49278f2e7d7f9a0fb28f1dae4ab7bed625654d1f5b81fc169f4aee366e001` |
| `Free 30-Day Trial of Microsoft 365 Copilot for Business.msg` | `a1c058f44984741868d7e2a5bfedb57555a018f14b6dedf0398cdeba4f8646a4` |
| `Free 30-Day Trial of Microsoft 365 Copilot for Business_files.zip` | `2ff883411974c45fb4e695a01c0fb68448ee374528966244613cddd24819cb7a` |
| `June2026_Focused Michelle.xlsx` | `0438ed4ac3a299ed7b357665a2731bdb9890569b1fec8e57fc2ebb99e2b0c9c6` |
| `NAV BC list (3)_w macros.xlsm` | `033f5c6859065a4c72625b516a3fc320acdaf0170e31be90e08b8dfc434d3cb9` |
| `Support customers.xlsx` | `effb3b04f1045ee74425aaa5218a182dc6a87c6ce56f795b412710736d90a3d3` |
| `Telemarketing_Pipeline_Fengfan.xlsx` | `c788b0568d0046c828e5d46324c865d3a10dbf13790d643d2662f12b24ff0570` |

## Aggregate workbook acceptance

| Workbook / sheet | Rows | Ready | Attention | Exact duplicates | Status review |
| --- | ---: | ---: | ---: | ---: | ---: |
| Current AMP customers / Sheet1 | 54 | 54 | 0 | 4 | 0 |
| Customer Contacts / Sheet1 | 1,895 | 1,841 | 54 | 48 | 0 |
| June2026 Focused Michelle / Clean Calling List (Mic) | 282 | 281 | 1 | 1 | 0 |
| June2026 Focused Michelle / Clean Calling List | 282 | 282 | 0 | 0 | 0 |
| June2026 Focused Michelle / Raw List | 353 | 346 | 7 | 4 | 0 |
| NAV BC list / Orginal NAV | 1,304 | 1,303 | 1 | 0 | 0 |
| Support customers / Active customers | 111 | 111 | 0 | 1 | 5 |
| Support customers / Inactive Customers | 248 | 245 | 3 | 3 | 8 |
| Telemarketing Pipeline / Pipeline | 15 | 15 | 0 | 0 | 0 |
| Telemarketing Pipeline / Potential Opportunities | 12 | 11 | 1 | 0 | 0 |

The attention rows are not discarded. Every parsed source row is included in the immutable source revision index so that rejected, duplicate, and review-required values remain traceable and exportable. Only rows that pass CRM normalization become company/contact/deal entities.

Status inference is deliberately conservative:

- `Current AMP customers.xlsx` infers `Maintenance Customer` for all 54 ready rows.
- Unambiguous `Support customers.xlsx` Active rows infer `Maintenance Customer`.
- Unambiguous Support Inactive rows infer `Former Customer`.
- Cross-tab duplicates, conflicting statuses, and blank/suspicious cases are flagged for review instead of silently overwritten.
- The Active sheet contains one explicit `Current Customer` value that conflicts with the sheet's maintenance implication; it is preserved and flagged.

## Defects caught by the real files

- Formatted trailing blank columns no longer make a valid sheet fail parsing.
- Duplicate visible headers are deterministically disambiguated, for example `Status` and `Status (2)`.
- `Customer Name` is accepted as a company-name header.
- The Focused Michelle `Phone` column maps to company phone without creating incomplete contacts.
- Contact-only fields without a contact name or email preserve the company and source values while producing a warning.
- Both AMP and AMC filename conventions infer maintenance-customer status.
- Explicit status values that contradict a Support workbook tab are review cases.
- The import revision index stores every parsed source row, not only CRM-ready rows.

## Email-template acceptance

The supplied HTML email contains 12 tables and 7 companion image references. The companion ZIP contains all 7 supported images, and the production import pipeline resolves all 7 references before sanitization. Table structure and a plain-text fallback are retained. The `.msg` file is recorded as an unsupported direct-import source; the matching HTML plus companion ZIP is the supported loss-minimizing path.

## Reproduce locally

```powershell
$env:CUSTOMER_FILES_DIR='C:\Users\ADMIN\OneDrive - Murdoch University\Ca-Meo Backup\Desktop\Customer files'
npx vitest run tests/customerFilesAcceptance.test.ts --reporter=verbose --silent=false
```

Expected result: 1 test file and 9 tests pass. The suite fails if the approved file set or any hash changes, forcing a deliberate review of a replacement customer file.

## Production workbook commits

The authenticated production pass committed all CRM-ready rows from all ten workbook sheets. Invalid rows and exact duplicates remain in the immutable source revision index and preserved workbook artifact.

| Database | Workbook / sheet | Source rows | Revision result |
| --- | --- | ---: | --- |
| `DB-PAZE4T` | Current AMP customers / Sheet1 | 54 | Revision 1: 50 created, 4 unchanged. Revision 2: 0 created, 11 updated, 43 unchanged. |
| `DB-WLW47Z` | Customer Contacts / Sheet1 | 1,895 | 1,641 created, 120 updated, 80 unchanged, 2 duplicate-review flags, 262 activities. |
| `DB-NANKRX` | June2026 Focused Michelle / Clean Calling List (Mic) | 282 | 279 created, 1 updated, 1 unchanged. |
| `DB-YJ5TCJ` | June2026 Focused Michelle / Clean Calling List | 282 | 59 created, 1 updated, 222 unchanged. |
| `DB-VZNY37` | June2026 Focused Michelle / Raw List | 353 | 66 created, 164 updated, 123 unchanged. |
| `DB-98QLUZ` | NAV BC list / Orginal NAV | 1,304 | 1,302 created, 1 unchanged, 17 duplicate-review flags, 1,967 activities. |
| `DB-EBTN8X` | Support customers / Active customers | 111 | 8 created, 78 updated, 25 unchanged, 4 customer-status review flags. |
| `DB-2R8UTJ` | Support customers / Inactive Customers | 248 | 35 created, 203 updated, 7 unchanged, 5 customer-status review flags. |
| `DB-YAJK3G` | Telemarketing Pipeline / Pipeline | 15 | 15 created, 16 activities. |
| `DB-U6UTGR` | Telemarketing Pipeline / Potential Opportunities | 12 | 11 created, 3 duplicate-review flags, 13 activities. |

A read-only production audit on 2026-10-08 confirmed all ten database identities, eleven source revisions, and eleven finalized R2 artifacts. `DB-PAZE4T` has two revisions and two ready artifacts; every other sheet has one. Re-uploading the unchanged AMP source retained its database identity and updated only values changed by the intervening overlapping workbook imports, which verifies both reconciliation and recoverable revision history without manufacturing a modified customer file.

## Live acceptance checklist

- [x] Uploaded and committed every CRM workbook sheet in the authenticated production workspace.
- [x] Confirmed all semantic mapping prompts before committing rows.
- [x] Verified Support Active/Inactive inferred statuses and ambiguous-status review flags in the UI and import result.
- [x] Re-uploaded an unchanged sheet and verified stable identity, revision 2, reconciled updates, unchanged rows, and finalized per-revision artifacts.
- [x] Verified selected/all-row export and user-selected ordered columns for contacts and companies.
- [x] Imported the supplied HTML email and all seven companion images as the production template `Microsoft 365 Copilot 30-Day Trial`; its subject, 12-table layout, images, and plain-text fallback were retained.
- [x] Verified the task-reminder popup, role search, configurable deal columns, editable activity notes, contact hide/outdated/verified controls, and bulk-hide behavior.
- [x] Verified the storage-usage display and safely resumed one bounded legacy archive step without deleting legacy rows.
- [x] Password change was tested successfully by the workspace owner on 2026-10-07.

## Production evidence and corrective releases

PR #36 was merged as `09f2f692ce12a66125074d2f1ad5e81acb2c7611` and Vercel reported the matching production deployment READY.

- The dashboard storage card rendered after the live `storage-status` request completed: Supabase 74.8% (374 MB / 500 MB), R2 1.7% (171 MB / 10 GB), and recovery complete.
- Contact search matched `Finance Manager` from the Role column. Verify, Mark outdated, Hide, Edit, and Delete are rendered as real buttons.
- The contact export dialog supports selected rows or all matching rows, Excel or CSV, and user-selected ordered columns.
- Deal columns expose independent Deal stage, Call outcome, Appointment status, Last call, and source/relationship fields with a small default set.
- Company activities expose occurred time, call/note type, workbook destination, optional follow-up task, editable timeline entries, and source lineage.
- The reminder button opens a task-reminder popup. This workspace currently has no unread reminders, so a due-task delivery event could not be observed without creating test data.
- One safe legacy archive step completed without deletion, increasing coverage from 11,000 rows / 44 verified objects to 11,250 rows / 45 verified objects. The archive remains resumable and is still building the `companies` table.
- Live review found the rich HTML template editor was unreachable from a Sales workspace. The follow-up fix adds `/sales/templates` to Sales navigation and dispatches it to the existing table/image/ZIP-capable editor.

The real production uploads then exposed five silent integration defects that unit-only validation had not reached. Each fix was merged to `main`, passed the full quality job, and completed the Supabase deployment workflow before the next retry:

- PR #38 (`e35779dd2d712c9b767ede2b79308eb54d49a82d`) renders structured Supabase failures as actionable messages instead of `[object Object]`.
- PR #39 (`93f36985207f9aac0c69794f61c0b683135b92a3`) grants the authenticated importer narrowly scoped permission to create its pending revision artifact.
- PR #40 (`706d1075f72c3869f184c0d79a42b8b672a2e80c`) gives only the bounded CRM import RPC a 60-second statement timeout so the 1,895-row customer source can commit atomically.
- PR #41 (`23b494d1ba1bc8773830ec702bd88582b36c6977`) applies RFC3986 encoding to shared R2 SigV4 object keys, fixing the parenthesized NAV filename without changing bucket scope.
- PR #42 (`ff8882f1a588ee14395c56c69088a84e8a6bf870`) widens the canonical company-name constraint from 200 to 500 characters, preserving four legitimate NAV names of 201–212 characters.

The final pre-documentation verification passed 153 test files with 564 tests, plus typecheck, lint, and the production build. The approved raw files remain outside Git; only hashes and aggregate evidence are committed.

### Browser automation prerequisite

Automated file selection in the existing Chrome session requires the ChatGPT browser extension setting **Allow access to file URLs**. If it is disabled, the file chooser cannot be controlled even though the CRM page and input are otherwise reachable. Enable it from `chrome://extensions` → ChatGPT → Details before continuing a future live upload pass.
