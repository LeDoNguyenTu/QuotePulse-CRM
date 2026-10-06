# Customer-file production acceptance — 2026-10-07

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

## Live acceptance checklist

- [ ] Upload and commit each workbook sheet in the authenticated production workspace.
- [ ] Confirm all semantic mapping prompts before committing rows.
- [ ] Verify Support Active/Inactive inferred statuses and review flags in the UI.
- [ ] Re-upload an unchanged sheet and verify revision/provenance behavior without duplicate loss.
- [ ] Re-upload a controlled changed copy and verify updates plus source history.
- [ ] Export selected rows and user-selected columns for contacts and companies.
- [ ] Import and preview the supplied HTML email with its companion image ZIP.
- [ ] Verify due-task notification, role search, configurable deal columns, editable activity notes, hide/outdated/verified controls, and bulk-hide behavior.
- [ ] Verify the storage-usage display and safely resume one bounded legacy archive step without deleting legacy rows.
- [x] Password change was tested successfully by the workspace owner on 2026-10-07.

## Production evidence after PR #36

PR #36 was merged as `09f2f692ce12a66125074d2f1ad5e81acb2c7611` and Vercel reported the matching production deployment READY.

- The dashboard storage card rendered after the live `storage-status` request completed: Supabase 74.8% (374 MB / 500 MB), R2 1.7% (171 MB / 10 GB), and recovery complete.
- Contact search matched `Finance Manager` from the Role column. Verify, Mark outdated, Hide, Edit, and Delete are rendered as real buttons.
- The contact export dialog supports selected rows or all matching rows, Excel or CSV, and user-selected ordered columns.
- Deal columns expose independent Deal stage, Call outcome, Appointment status, Last call, and source/relationship fields with a small default set.
- Company activities expose occurred time, call/note type, workbook destination, optional follow-up task, editable timeline entries, and source lineage.
- The reminder button opens a task-reminder popup. This workspace currently has no unread reminders, so a due-task delivery event could not be observed without creating test data.
- One safe legacy archive step completed without deletion, increasing coverage from 11,000 rows / 44 verified objects to 11,250 rows / 45 verified objects. The archive remains resumable and is still building the `companies` table.
- Live review found the rich HTML template editor was unreachable from a Sales workspace. The follow-up fix adds `/sales/templates` to Sales navigation and dispatches it to the existing table/image/ZIP-capable editor.

### Browser automation prerequisite

Automated file selection in the existing Chrome session requires the ChatGPT browser extension setting **Allow access to file URLs**. If it is disabled, the file chooser cannot be controlled even though the CRM page and input are otherwise reachable. Enable it from `chrome://extensions` → ChatGPT → Details before continuing the live upload pass.
