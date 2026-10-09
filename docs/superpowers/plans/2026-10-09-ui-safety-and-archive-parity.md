# UI Safety and Archive Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver organized row/navigation controls, reliable unsaved-work protection, compact settings feedback, and a live-like read-only Legacy experience backed directly by verified R2 archive objects.

**Architecture:** Keep shared cross-table row actions unchanged and compose a contact-only menu around existing callbacks. Add one reusable dirty-form guard for browser and React Router navigation. Evolve the existing signed/checksummed archive browse endpoint and Legacy archived dashboard rather than introducing a second archive path or restoring data for reads.

**Tech Stack:** React 18, TypeScript, React Router 6, TanStack Query 5, Vitest, Supabase Edge Functions, Cloudflare R2.

**Spec:** `docs/superpowers/specs/2026-10-09-ui-safety-and-archive-parity.md`

## Global Constraints

- Preserve per-user workspace ownership checks and R2 checksum verification.
- Keep `CrmRowActions` unchanged because GitNexus reports CRITICAL shared impact across Companies, Contacts, and Deals.
- Use semantic theme variables in both light and dark modes.
- No archive browse action may mutate or restore rows.
- Build and typecheck must be clean, followed by authenticated production verification.

## Review Focus

- Menus must dismiss on outside click, Escape, selection, route change, and sibling-menu open.
- Disabled/pending lifecycle actions must not fire, and destructive Delete remains visually separated.
- Dirty guards must not prompt after a successful save or when untouched.
- Archive paging/search must not skip an object boundary or expose a non-allow-listed field.
- A deleted live archive may be browsed, but editing always requires explicit selective restore.

---

### Task 1: Contact action hierarchy

**Files:**
- Modify: `src/components/crm/ContactLifecycleControls.tsx`
- Modify: `src/pages/crm/CrmContacts.tsx`
- Modify: `src/styles/index.css`
- Test: `src/components/crm/ContactLifecycleControls.test.tsx`

**Interfaces:**
- Consumes: the existing `contact`, `pending`, lifecycle `onChange`, edit, and optional delete callbacks.
- Produces: `ContactRowActions` with a primary Edit button and a self-closing More menu.

- [ ] Write a failing render test that expects Edit, More, separated Delete, and the lifecycle labels inside one contact-specific action component.
- [ ] Run the focused test and confirm it fails because `ContactRowActions` does not exist.
- [ ] Implement `ContactRowActions`, close it after any action, and replace the two stacked action groups in `CrmContacts`.
- [ ] Add compact menu alignment, focus, pending, dark-mode, and destructive-item styles.
- [ ] Run the focused test and Contacts page tests.

### Task 2: Refined self-dismissing navigation groups

**Files:**
- Modify: `src/components/Layout.tsx`
- Modify: `src/styles/index.css`
- Test: `src/components/Layout.test.tsx`

**Interfaces:**
- Consumes: existing grouped navigation items and current pathname.
- Produces: controlled menu groups with one-open-at-a-time state and `onRequestOpen` / `onRequestClose` behavior.

- [ ] Add failing interaction tests for outside click, Escape, item selection, and sibling menu switching.
- [ ] Run the focused tests and confirm the current native details behavior fails dismissal expectations.
- [ ] Implement controlled groups with document pointer/focus handling and a minimalist inline SVG chevron.
- [ ] Restyle triggers as quiet outlined pills with distinct hover/open/active states and reduced-motion support.
- [ ] Run focused layout tests.

### Task 3: Unsaved-work guard and settings feedback

**Files:**
- Create: `src/hooks/useUnsavedChanges.ts`
- Create: `src/hooks/useUnsavedChanges.test.tsx`
- Modify: `src/pages/crm/CrmSalesSettings.tsx`
- Modify: `src/pages/crm/CrmEmailCampaigns.tsx`
- Modify: `src/styles/index.css`
- Test: `src/pages/SalesWorkspacePage.test.tsx`
- Test: `src/pages/crm/CrmEmailCampaigns.test.tsx`

**Interfaces:**
- Produces: `useUnsavedChanges({ dirty, message })` using React Router blocking and `beforeunload`.
- Consumes: stable initial snapshots from Settings and Campaigns; clears dirty state after successful persistence/queueing.

- [ ] Add failing hook tests for untouched, dirty navigation, unload, and successful-reset cases.
- [ ] Implement the reusable guard without intercepting same-page anchors or clean forms.
- [ ] Add explicit dirty snapshots to Settings and Campaigns and wire the guard.
- [ ] Replace nested `ErrorState` feedback in Settings with compact success/error banners; label the button “Save changes” and disable it when clean or invalid.
- [ ] Add dirty-discard confirmation to draft-clearing actions and run the focused tests.

### Task 4: Legacy R2 live-like read-only experience

**Files:**
- Modify: `supabase/functions/workspace-archive/archiveBrowse.ts`
- Modify: `supabase/functions/workspace-archive/index.ts`
- Modify: `supabase/functions/workspace-archive/archiveBrowse.test.ts`
- Modify: `src/components/crm/ArchivedRecordTable.tsx`
- Modify: `src/components/crm/ArchivedRecordTable.test.tsx`
- Modify: `src/pages/Dashboard.tsx`
- Modify: `src/styles/index.css`
- Test: `src/pages/Dashboard.test.tsx`

**Interfaces:**
- Consumes: verified archive metadata, signed cursor, checksum-verified R2 payloads, and existing selective restore.
- Produces: complete projection metadata, deterministic pagination/search progress, familiar three-tab ledger, and automatic archived-mode selection when live rows are empty.

- [ ] Add failing backend tests for projection parity, cursor boundaries, multi-object search continuation, and denied fields.
- [ ] Extend only the Companies/Deals/Contacts display allow-lists and return enough progress metadata for familiar paging.
- [ ] Add failing UI tests for automatic archived mode, search, tabs, paging, read-only badge, and restore-before-edit warning.
- [ ] Rework the archived dashboard/table to match the live ledger’s density, controls, and empty/error states while retaining explicit read-only language.
- [ ] Run Edge Function and dashboard tests and verify browsing never calls restore.

### Task 5: Release verification and documentation

**Files:**
- Create: `docs/development/2026-10-09-ui-safety-and-archive-parity-handoff.md`

**Interfaces:**
- Produces: exact test, commit, PR, deployment, and authenticated production evidence.

- [ ] Run GitNexus change detection and confirm only intended flows changed.
- [ ] Run focused tests, full tests, typecheck, lint, and production build.
- [ ] Commit, push, open and merge the PR, then wait for GitHub/Supabase and Vercel deployment completion.
- [ ] Verify Contacts menus, navigation dismissal, settings dirty guard/feedback, Campaign dirty guard, and Legacy R2 browsing in the authenticated production UI without mutating customer data.
- [ ] Record the final SHA, checks, deployment, limitations, and recovery path in the handoff.
