# Company contacts and theme release handoff

## Scope

- Sales CRM company rows keep the company link and an expandable, lazy-loaded list of every linked contact together in the Company cell.
- The optional Contacts column remains a simple relationship count and is visible in the default column set.
- Legacy dashboard company rows replace the primary-contact-only preview with an expandable list of all linked contacts.
- Company detail associations page through the complete contact relationship instead of stopping at 100 rows.
- A persistent Light/Dark switch sits beside Switch workspace. The saved preference applies before React renders and is shared across authenticated and authentication screens.

## Data and tenancy guarantees

- Sales contact expansion filters by both `workspace_id` and `company_id`.
- Contact pages use stable `full_name`, then `id`, ordering and the existing bounded page collector.
- Legacy contact expansion continues through the owner-scoped `useCompanyContacts` query.
- No migration, destructive data operation, email send, or provider-secret change is part of this release.

## Regression coverage

- `src/components/crm/CompanyContactsDisclosure.test.tsx`
- `src/components/ThemeToggle.test.tsx`
- `src/lib/theme.test.ts`
- `src/lib/crm/detailQueries.test.ts`
- `src/lib/tablePreferences.test.ts`

Run the release checks with:

```powershell
npm test -- --run
npm run typecheck
npm run lint
npm run build
git diff --check
```

## Production acceptance

After merge, confirm the exact Git SHA is Ready in Vercel, then use an authenticated browser session to verify:

1. Sales CRM Companies shows the contact disclosure under every company name and expands all linked contacts.
2. Legacy Companies expands all linked contacts rather than only the primary contact.
3. The Light/Dark switch is beside Switch workspace, changes the rendered palette, and survives a reload.
4. Company detail displays the complete linked-contact association.
