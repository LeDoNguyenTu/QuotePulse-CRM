# QuotePulse CRM — Project Context

> Read this first. Everything below the `gitnexus` marker is auto-generated and will be
> overwritten by `npx gitnexus analyze` — **keep human-written context above that marker.**

## What this app is

A sales automation / outreach CRM. Import CRM data from **HubSpot** → clean messy deal names
into canonical **companies** → enrich each company with public **KYC** data (website, LinkedIn,
address, public contacts) → send **bulk outreach email** through the user's Outlook mailbox via
Microsoft Graph, with cooldowns and daily caps. Plus templates, dashboard filters, Excel export,
and a 30-day recycle bin.

**Stack:** Vite + React 18 + TypeScript SPA (React Router 6, TanStack Query 5, Tailwind) ·
Supabase (Postgres + Auth + Deno Edge Functions) · Vercel (frontend) · HubSpot CRM v3 ·
Microsoft Graph · Serper.dev (Google search for KYC) · NVIDIA Build (quote-PDF OCR).

## Where things live

| | |
|---|---|
| Supabase project ref | `qgcooulzzbjebwczjgis` |
| GitHub | `LeDoNguyenTu/QuotePulse-CRM` (branch `main`) |
| Vercel | `itsbrian/quote-pulse-crm` |
| Frontend | `src/` — `pages/`, `components/`, `hooks/`, `lib/` |
| Backend | `supabase/migrations/*.sql`, `supabase/functions/<name>/index.ts`, `supabase/functions/_shared/` |

**Edge Functions:** `hubspot-ingest`, `enrich-kyc`, `parse-quote`, `ms-auth-start`,
`ms-auth-callback`, `process-email-queue`, `export-xlsx`. All have `verify_jwt = true`.

## Deploy pipeline

- **Frontend:** push to `main` → **Vercel auto-deploys.**
- **Database + Edge Functions:** deployed by `.github/workflows/supabase.yml` on push to `main`
  (needs repo secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`).
  Manual fallback: `supabase db push` and
  `supabase functions deploy <name> --project-ref qgcooulzzbjebwczjgis`.
- **Secrets** are set with `supabase secrets set …` — never in `.env` (only `VITE_*` vars go there,
  and they are public).

> Before the CI workflow existed, Supabase was **never** auto-deployed — migration `0004` sat
> unapplied in prod for weeks while the frontend that depended on it shipped. If a feature works
> locally but 404s/500s in prod, **check `list_migrations` against `supabase/migrations/` first.**

## Tenancy model — per-user private

Every row in `companies`, `deals`, `contacts`, `attachments`, `kyc_profiles`, `email_templates`
carries **`owner_id → auth.users.id`**; `email_sends` uses `created_by`. RLS is
`using (owner_id = auth.uid()) with check (owner_id = auth.uid())`. `industries` is a shared
read-only lookup. `user_settings` is private per `user_id` and holds the per-user secrets
(HubSpot token, MS refresh token, NVIDIA key).

`owner_id` has `default auth.uid()`, so **browser inserts need no code change** — but Edge
Functions run as **service role**, where `auth.uid()` is NULL, so they **must set `owner_id`
explicitly on every write and filter `.eq('owner_id', userId)` on every read.**

## Gotchas that keep biting

1. **Service role bypasses RLS entirely.** Fixing an RLS policy does *nothing* for Edge
   Functions. Every query in `supabase/functions/**` needs an explicit owner filter. This has
   already caused two real leaks (`export-xlsx` dumping the whole DB; `process-email-queue`
   sending other users' mail from your mailbox).
2. **`onConflict` cannot target a functional or partial unique index** — Postgres raises 42P10
   ("no unique or exclusion constraint matching…"), which does *not* contain the word
   "duplicate", so `.includes('duplicate')` guards let it through as a hard error. Affected
   indexes: `contacts (company_id, lower(email)) where email is not null` and
   `attachments (owner_id, hubspot_attachment_id) where … is not null`.
   **Use dedupe-then-insert** (select → skip if found → insert; ignore `23505`).
3. **HubSpot: a Personal Access Key ≠ a Private App token.** A PAK is base64 protobuf starting
   `CiR…` and is a *refresh* credential — it must be exchanged at
   `POST https://api.hubapi.com/localdevauth/v1/auth/refresh` (`{ encodedOAuthRefreshToken }`) for
   a short-lived access token. A Private App token is plain text `pat-na1-…` and is used
   directly as the bearer. `_shared/hubspot.ts → resolveAccessToken()` handles both. The account
   owner has **no permission to create Private Apps**, so the PAK path is the live one.
4. **HubSpot 403s the *entire* request** if any requested `associations=` type is outside the
   token's scopes. Always degrade (retry without `notes,quotes`) rather than letting one missing
   scope kill the whole import.
5. **`supabase/config.toml` configures the LOCAL stack only.** Auth **Site URL** and the redirect
   allow-list live in the Supabase **dashboard** and are not in the repo. The factory default is
   `http://localhost:3000`, which silently breaks production email verification links.
6. **The Supabase MCP in this environment is read-only.** Migrations, function deploys, and
   secrets must go through CI or the user's CLI.
7. Don't let Edge Functions return `ok: true` on failure. `hubspot-ingest` used to swallow every
   error into an `errors[]` array and still return HTTP 200, so a total auth failure rendered as
   *"import complete: 0 companies (2 warnings)"*. Surface `errors[]` in the UI.
8. **Deal names are `PRODUCT - CUSTOMER`, and the customer comes SECOND.**
   `ADOBE (REN) - THE PR PEOPLE PTE LTD (AB005226)` — the company is *THE PR PEOPLE*; ADOBE is
   the software they are buying and `(AB005226)` is an account code. The original cleaner kept
   the text *before* the dash, and since companies dedupe on `lower(name_clean)`, every customer
   buying the same product collapsed into one row: **374 deals under "Adsk", 344 under "Adobe"**,
   and KYC researched Adobe instead of the client. `deals.product` now keeps the vendor.
   Only **93%** of names use ` - `; the rest are `LT--ATLOG PTE LTD`, `STARHUB-\tQool Labs Pte
   Ltd-MB LINE`, `ADOBE (REN) THE TANGLIN CLUB` (no dash at all). Splitting on "a dash" cannot
   work — hyphens appear inside both the product (`V-RAY`) and the customer (`AIR-CONDITIONING`,
   `Kyodo-Allied`). So `_shared/dealName.ts` **learns the vendor list** from the well-punctuated
   93% (`learnProducts`) and uses it to anchor the cut on the rest; matching ignores punctuation,
   so `V-RAY` ≡ `VRAY` and `SKETCH UP` ≡ `SKETCHUP`.
   Re-importing does **not** repair existing rows — the sweep is incremental and skips unchanged
   deals — so `hubspot-ingest` takes `{mode:'rebuild'}`, which re-derives companies from the deals
   already in Postgres and drops the leftover vendor rows into the recycle bin ("Fix company
   names").
9. **Import is a SYNC, not a re-import.** `deals.hubspot_modified_at` stores HubSpot's
   `hs_lastmodifieddate`; `onlyChanged()` drops any deal whose timestamp still matches, so the
   expensive part (one HTTP call per associated company, contact and note) is skipped. Paging is
   cheap; `processDeal` is not.
   **Backfill-vs-incremental is decided from live COUNTS, not a stored phase flag.** Incremental
   mode (Search API, `hs_lastmodifieddate GT watermark`) can only see *recently modified* deals,
   so a deal older than the watermark that was never imported is invisible to it forever. A stored
   `phase='incremental'` once stranded **127k of 183k** deals this way (a smaller earlier portal's
   backfill had latched the flag; a bigger portal was connected later). `dealsCaughtUp()` compares
   our row count to `hs.countAll('deals')` each run, so any real gap re-enters backfill; the stream
   only graduates to incremental once the count proves we hold ~everything (`CATCHUP_SLACK`).
10. **Industry is classified from the company name, not searched.** `_shared/industry.ts` keyword-
   matches the trade out of the name ("SUNLEY M&E ENGINEERING" → Engineering), because enriching
   1,200 companies through Serper would cost 1,200 lookups. KYC overwrites it when the user runs
   it. The filter dropdown reads the `company_industries` view (industries actually present),
   **not** the `industries` lookup table — the lookup offered ten industries while no company had
   one, so every choice filtered to zero rows.
11. **HubSpot attachments are PRIVATE files with no durable URL.** `GET /files/v3/files/{id}`
   returns a `url` that only works for `PUBLIC_*` files; everything attached to a note or a
   quote is private, so `attachments.file_url` is legitimately **null**. Bytes come from
   `GET /files/v3/files/{id}/signed-url`, which expires in minutes — so `parse-quote` mints one
   per parse from `hubspot_attachment_id`; **never store it.** Quote-object attachments are not
   files at all (the id is a *quote* id): their PDF is the `hs_pdf_download_link` property.
   All of this needs the **`files`** scope, which is *not* on the current personal access key —
   without it the import stores placeholder names (`file-<id>`) and OCR cannot download.
12. **Migration files MUST be named `<14-digit-timestamp>_<name>.sql`.** The CLI derives the
   version from the leading digits, and the remote history table already holds timestamp
   versions (`0001–0003` were applied via the dashboard/MCP, which records a timestamp). Plain
   `0004_foo.sql` makes `supabase db push` fail with *"Remote migration versions not found in
   local migrations directory"*. Keep the `000N_` part after the timestamp so the derived name
   still matches the remote row.

## Edge Function secrets (11)

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (both auto-injected; the service key doubles as the
HMAC key for the Microsoft OAuth `state`), `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`,
`AZURE_CLIENT_SECRET`, `AZURE_REDIRECT_URI`, `SEARCH_API_KEY` (Serper.dev — **without it, KYC
cannot search by name at all**), `SEARCH_API_URL` (optional), `NVIDIA_API_KEY`, `NVIDIA_OCR_URL`,
`NVIDIA_OCR_MODEL`.

## Verify before claiming done

```bash
npm run build && npm run typecheck   # must be clean
```
Then exercise the real flow — the failures in this codebase are overwhelmingly *silent*
(swallowed errors, RLS no-ops, unapplied migrations), so a green build proves very little.

---

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **Client** (2918 symbols, 5370 relationships, 209 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/Client/context` | Codebase overview, check index freshness |
| `gitnexus://repo/Client/clusters` | All functional areas |
| `gitnexus://repo/Client/processes` | All execution flows |
| `gitnexus://repo/Client/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
