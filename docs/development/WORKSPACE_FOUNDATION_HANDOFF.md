# Workspace Foundation Handoff

Date: 2026-09-28  
Branch: `codex/sales-crm-workspace-foundation`  
Base: `QuotePulse-CRM/main` at `223894d`  
Implementation head before this handoff: `84250d2`

## Delivered scope

Phase A establishes a workspace boundary without moving or rewriting existing QuotePulse business data:

- `public.workspaces`, `public.workspace_members`, and `public.workspace_archives`
- one `legacy` and one `sales_crm` workspace provisioned idempotently for every existing and newly created user
- read-only authenticated access to workspace metadata, constrained by RLS membership checks
- a workspace query/provider and active-workspace context in the React application
- guarded workspace routes under `/w/:workspaceId/legacy/*` and `/w/:workspaceId/sales/*`
- a post-login workspace selector
- a Sales CRM shell for Leads, Opportunities, Tasks, Interactions, Campaigns, Reports, and Settings
- workspace-preserving navigation throughout the legacy application
- archive lifecycle metadata only; no legacy row deletion or R2 archive transfer is performed in Phase A

The migration deliberately does **not** add `workspace_id` to the existing legacy business tables. Their current `owner_id` isolation remains unchanged.

## Commits

- `535d6ec` — design the multi-workspace CRM foundation
- `ff265e3` — plan the implementation
- `4046b5f` — add workspace membership and archive metadata schema
- `86611df` — add workspace query context
- `c70a7da` — guard workspace routes
- `6fc8db1` — add the selector and Sales CRM shell
- `84250d2` — route authenticated users through workspaces

## Verification completed

- `npm test -- --run`: 60 test files, 273 tests passed
- `npm run typecheck`: passed
- `npm run lint`: passed
- `npm run build`: passed; Vite reported only the existing-style bundle warning for a 605.11 kB minified JavaScript chunk
- focused routing verification: 13 tests passed across app routes, return navigation, and auth callback behavior
- `git diff --check`: passed before the routing commit
- rendered local browser smoke: `/workspaces` redirected an unauthenticated browser to `/login`; the login view rendered at desktop width
- browser console: no application errors; two React Router v7 future warnings and Cloudflare Turnstile error `110200` occurred in the local origin

Authenticated selector, Sales shell, and Legacy shell pages were **not** rendered in-browser because no authenticated test session was available. Do not treat the public-route smoke as authenticated UI acceptance.

## Database and deployment status

The migration is committed but has **not** been proven applied to the hosted Supabase project. The checkout is not linked to a project for a safe read-only ledger comparison.

Executable local PostgreSQL checks are blocked:

- Supabase CLI version: `2.118.0`
- `npx supabase db lint --local --level error --fail-on error` and `npx supabase test db supabase/tests/workspace_isolation.sql --local` stop at `DbConfigLoadError: failed to parse environment file: .env`
- Docker and `psql` are not installed, so bypassing that parser would still not provide a local PostgreSQL runtime
- the committed SQL transaction at `supabase/tests/workspace_isolation.sql` is ready for a PostgreSQL/Supabase environment

No production deployment was initiated. Pushing this branch to `main` would invoke the repository's Vercel and Supabase deployment paths, so deployment should wait for executable migration/RLS verification and an authenticated browser smoke.

The Vercel CLI is not installed. Install it with `npm i -g vercel` before deployment work if agent-accessible `vercel env pull`, `vercel deploy`, and `vercel logs` are desired.

## Security review

- no service-role, R2, HubSpot, Microsoft, or other backend secret was added to frontend code
- no existing Edge Function was broadened or given new cross-tenant behavior
- authenticated users receive `SELECT` only on workspace metadata tables
- RLS policies filter workspaces and archive records through indexed membership rows
- provisioning functions are `SECURITY DEFINER`, use an empty fixed `search_path`, and are revoked from public, anonymous, and authenticated callers
- archive metadata cannot claim verified/deletion-ready/deleted status without a manifest key, checksum, and verification timestamp

## Required acceptance before merge or deployment

1. Run the migration and `supabase/tests/workspace_isolation.sql` against an isolated local Supabase stack or disposable PostgreSQL database.
2. Confirm migration history and schema in the intended hosted Supabase project after CI applies it.
3. Sign in with a test user and render both workspace cards, the Sales shell, the Legacy shell, mismatch handling, and mobile layouts.
4. Check production console/network behavior and verify default workspaces are created for both an existing and a newly registered test user.

## First Phase B action

Define the normalized Sales CRM data model under the `sales_crm` workspace (`leads`, `opportunities`, `tasks`, `interactions`, campaign membership, and audit fields), with membership-based RLS and storage-aware indexes. Keep legacy archive creation and verified deletion as a separate, explicitly accepted operational stream.
