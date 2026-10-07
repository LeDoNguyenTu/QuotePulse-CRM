# Outlook MSG template import

## Delivered behavior

- The legacy template editor accepts `.msg`, `.htm`, and `.html` files.
- `.msg` parsing happens in the browser. The raw Outlook file is never uploaded or stored.
- Subject, HTML, plain-text fallback, and PNG/JPEG/GIF/WebP attachments are extracted.
- Outlook encapsulated HTML inside compressed RTF is reconstructed, preserving the supplied
  customer message's 12 tables and 7 inline images.
- Inline `cid:` image references are mapped to uploaded protected template assets before the
  existing HTML sanitizer and preview pipeline runs.
- The existing 5 MiB per-image and 20 MiB total-image limits still apply. The source `.msg` is
  limited to 25 MiB.
- If a message contains only plain text, it is escaped and converted to minimal HTML.

## Security and data handling

- Active HTML (`script`, `iframe`, forms, event handlers, unsafe URL schemes, and similar
  content) is removed by `prepareImportedEmailHtml` before preview or sending.
- Only supported image attachments are uploaded. Other `.msg` attachments are ignored.
- The parser is loaded only when a user imports a `.msg`, keeping it out of the initial app
  bundle.

## Compatibility

Brevo already receives both `htmlContent` and `textContent` from the CRM queue. No provider
change is needed for table-based email templates or inline HTTPS image URLs.

## Verification

Run the ordinary checks:

```powershell
npm test -- --run
npm run typecheck
npm run lint
npm run build
```

Run the private customer-file acceptance suite without committing customer files:

```powershell
$env:CUSTOMER_FILES_DIR='C:\Users\ADMIN\OneDrive - Murdoch University\Ca-Meo Backup\Desktop\Customer files'
npm test -- --run tests/customerFilesAcceptance.test.ts
```

The acceptance test verifies the customer `.msg` imports with 12 tables, 7 inline images, no
unresolved image references, and a non-empty text fallback.
