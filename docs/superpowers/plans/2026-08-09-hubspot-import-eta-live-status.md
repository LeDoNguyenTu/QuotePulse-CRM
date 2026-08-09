# HubSpot Import ETA and Live Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the inflated lifetime ETA with a recent-server-step estimate and add an animated, accessible indication that HubSpot import work is still active.

**Architecture:** Put timing calculations in a pure `importProgress` module, store only the latest completed-step timestamp and recent rate in the persisted `LiveImport` state, and keep the visual clock local to the small progress panel. Legacy saved state remains valid because new fields are optional and fall back to the active run start.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Vitest.

## Global Constraints

- Do not add API calls or polling beyond the existing import loop.
- Reset the active timing window whenever a paused import resumes.
- Hide ETA when the latest completed step made no imported-deal progress.
- Keep the existing safe cooperative Stop behavior.
- Do not commit or push; the user owns the commit.

---

### Task 1: Pure recent-step timing model

**Files:**
- Create: `src/lib/importProgress.ts`
- Create: `src/lib/importProgress.test.ts`

**Interfaces:**
- Produces: `recentDealsPerSecond(previousImported, currentImported, previousAt, currentAt): number | null`
- Produces: `recentImportEtaMinutes(remaining, dealsPerSecond, phase): number | null`
- Produces: `importActivityText(secondsSinceResponse): string`

- [ ] Write tests with literal timestamps proving a positive deal delta produces the expected rate, zero delta returns `null`, property phase hides ETA, and the status text changes at 60 seconds.
- [ ] Run `npm test -- src/lib/importProgress.test.ts --run` and observe failure because the module does not exist.
- [ ] Implement the three pure functions with finite/non-negative input guards.
- [ ] Re-run the focused test and keep it green.

### Task 2: Persist recent completed-step metrics

**Files:**
- Modify: `src/hooks/useHubspotImport.tsx`
- Modify: `src/lib/importSession.test.ts`

**Interfaces:**
- Consumes: `recentDealsPerSecond` from Task 1.
- Extends: `LiveImport` with optional `lastStepAt?: number` and `recentDealsPerSec?: number | null`.

- [ ] Extend the legacy normalization test to prove live state without the optional fields remains valid.
- [ ] Reset `startedAt`, `lastStepAt`, and the recent rate when Start/Resume is selected while preserving cumulative counts and the saved step cursor.
- [ ] After each completed server slice, compute the rate from the previous and current `progress.deals_imported`, then persist the completion timestamp and rate.
- [ ] Run the focused import-session test and TypeScript check.

### Task 3: Animated accessible status and accurate ETA

**Files:**
- Modify: `src/pages/Dashboard.tsx`

**Interfaces:**
- Consumes: `recentImportEtaMinutes` and `importActivityText` from Task 1.
- Consumes: optional recent-step fields from Task 2.

- [ ] Replace the lifetime-average ETA with `recentImportEtaMinutes(remaining, live.recentDealsPerSec, progress.phase)`.
- [ ] Add a one-second local clock effect inside `ImportProgressPanel` and clear it on unmount.
- [ ] Render an `animate-spin` circular indicator with an accessible status message using the last completed response time.
- [ ] Keep the existing property-repair and Stop copy unchanged.
- [ ] Run the React quality checklist for interval cleanup, derived state, accessibility, and component scope.

### Task 4: Verification and handoff

**Files:**
- Review all changed files.

**Interfaces:**
- Produces: verified working tree and a user-owned commit message.

- [ ] Run `npm test -- --run`.
- [ ] Run `npm run typecheck`, `npm run lint`, and `npm run build`.
- [ ] Run GitNexus change detection, `git diff --check`, and a secret-pattern scan.
- [ ] Report the exact behavior, verification results, deployment note, and commit message without committing or pushing.
