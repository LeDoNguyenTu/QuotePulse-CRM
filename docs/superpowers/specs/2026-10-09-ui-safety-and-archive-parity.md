# UI Safety and Archive Parity Spec

## Goal

Make dense CRM controls calmer and safer without removing capability, and make verified Legacy R2 archives feel like the live Legacy ledger while remaining read-only until a user explicitly restores a record.

## Required behavior

- Contact rows show one primary Edit action and one compact More menu. Lifecycle actions and Delete live in the menu, with Delete visually separated.
- Outreach and Tools look like intentional menu triggers, use a restrained chevron treatment, and close after selection, outside click, Escape, or opening the sibling menu.
- Settings errors render as compact inline feedback instead of a large nested error panel. The save action is simply “Save changes” and is enabled only when delivery/session values are dirty and valid.
- Dirty settings and campaign drafts warn before browser reload/close or in-app navigation. Cancel/replace actions that discard a local draft use the same warning contract.
- A verified/deleted Legacy archive is selected automatically when live Legacy records are absent. Its Companies, Deals, and Contacts views retain search, tabs, paging, familiar columns, read-only labeling, and per-record restore-before-edit.
- Archive reads remain owner-scoped, checksum-verified, cursor-signed, projected through an allow-list, and served from R2. Browsing must never silently restore records.

## Non-goals

- Rewriting the Sales CRM tables or changing contact lifecycle persistence.
- Restoring the entire Legacy archive merely to display it.
- Exposing secrets, rendered email bodies, tokens, or non-allow-listed archive fields.

