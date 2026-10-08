# UI shell and dark-form polish handoff

## Delivered behavior

- Sales CRM navigation keeps Dashboard, Companies, Contacts, Deals, and Tasks directly visible.
- Templates and Email Campaigns are grouped under Outreach; Imports, PST Extractor, Recycle bin, and Settings are grouped under Tools.
- The current grouped area remains visibly active without forcing its menu open.
- Sales CRM uses an original connected-record mark; Legacy uses an original layered-archive mark. Workspace names and routes are unchanged.
- Campaign and settings sections no longer use numbered badges where the content is not a required sequence.
- Campaign, settings, recipient, consent, review, and saved-connection surfaces use semantic workspace colors so light and dark themes retain consistent contrast.
- HTML email iframes intentionally remain white because they represent the recipient's actual email canvas.

## Compatibility and accessibility

- Every existing route remains available and keeps its original URL.
- Legacy navigation remains a direct five-link list.
- Group menus use native `details`/`summary`, visible keyboard focus, active-route styling, and close after a destination is chosen.
- Both workspace marks keep their existing accessible labels and compact sizing contract.
- Mobile navigation wraps instead of requiring an excessively long horizontal function list.

## Verification

```powershell
npm test -- --run
npm run typecheck
npm run lint
npm run build
git diff --check
```

Production acceptance should inspect Sales CRM Email Campaigns, Settings, the header menus, the workspace selector, and both light/dark modes at desktop and narrow widths.
