# HTML template charset and image relinking acceptance

## Customer-file reproduction

Validated against the supplied Outlook export and companion ZIP in the external customer-files directory (the files are not copied into the repository).

- The HTML declares `windows-1252`; import now decodes the declared charset instead of forcing UTF-8.
- The smart apostrophe in `organisation’s` is preserved and no Unicode replacement character is introduced.
- All 12 table elements are preserved.
- All 7 HTML image references match the 7 ZIP images by decoded basename.
- Outlook `Sent:` and `Subject:` transport paragraphs are removed without consuming the following image-only paragraph.

## Save and reopen behavior

Unmatched relative and CID image references are stored as inactive `data-quotepulse-src` attributes. They cannot load or execute while unresolved, but they retain their location in the HTML so a later companion-ZIP upload can relink them. Embedded `data:` images remain removed.

## Verification commands

```powershell
$env:CUSTOMER_FILES_DIR='C:\Users\ADMIN\OneDrive - Murdoch University\Ca-Meo Backup\Desktop\Customer files'
npx vitest run src/lib/emailTemplateHtml.test.ts tests/customerFilesAcceptance.test.ts --exclude '.worktrees/**'
npm run typecheck
npm run lint
npm run build
```
