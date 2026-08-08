# Sales Automation & Outreach Tool

A production-ready sales outreach app that:

- **Imports** HubSpot CRM data (recycled/archived deals, deleted accounts, active deals, notes, attachments) via the CRM v3 REST API.
- **Cleans** messy deal names into canonical **companies**.
- **Enriches** each company with external KYC data (website, LinkedIn, public contacts).
- **OCRs** MYOB quote PDFs with **NVIDIA Build** to extract structured contact/quote info.
- **Sends bulk email** through your **Outlook / Microsoft 365** mailbox (Microsoft Graph `sendMail`) with an enforced cooldown and daily safety limits.
- Provides a searchable/filterable **dashboard**, template management, and Excel export.

**Stack:** Vite + React + TypeScript (SPA) · Supabase (Postgres + Auth + Edge Functions) · Vercel (frontend) · Microsoft Graph · HubSpot · NVIDIA Build OCR.

**Tenancy:** shared team workspace — all authenticated users see the same CRM data; per-user secrets (HubSpot token, Microsoft refresh token) are private in `user_settings`.

---

## Architecture

```
Browser (React SPA, Vercel)
  │  supabase-js: Auth + table queries (RLS) + functions.invoke()
  ▼
Supabase
  ├─ Postgres (companies, deals, contacts, attachments, kyc_profiles,
  │            email_templates, email_sends, user_settings, industries)
  │  └─ RLS: authenticated = shared workspace; user_settings = private
  └─ Edge Functions (Deno, service-role → bypass RLS)
       ├─ hubspot-ingest        → HubSpot CRM v3
       ├─ enrich-kyc            → Web search + site scrape
       ├─ parse-quote           → NVIDIA Build OCR
       ├─ ms-auth-start/-callback → Azure AD OAuth (delegated Mail.Send)
       ├─ process-email-queue   → Microsoft Graph sendMail (cooldown + limits)
       └─ export-xlsx           → exceljs
```

Full folder map is in the plan; key directories: `src/` (SPA) and `supabase/` (migrations + functions).

---

## Prerequisites

- Node 18+ and npm
- A [Supabase](https://supabase.com) project (free tier)
- [Supabase CLI](https://supabase.com/docs/guides/cli): `npm i -g supabase`
- A [Vercel](https://vercel.com) account (Hobby tier) for the frontend
- An **Azure AD** app registration (for Microsoft Graph)
- A **HubSpot Private App** token
- An **NVIDIA Build** API key (build.nvidia.com)
- A [Serper.dev](https://serper.dev) API key for KYC web search (real Google results; 2,500 free credits) — optional; KYC degrades gracefully without it

---

## 1) Local setup

```bash
npm install
cp .env.example .env      # then fill in values (see Environment Variables)
npm run dev               # http://localhost:5173
```

Create the database locally (or push to your cloud project — see step 3):

```bash
supabase start                 # local Postgres + Studio (optional)
supabase db reset              # applies migrations + seed.sql locally
supabase functions serve       # run Edge Functions locally
```

---

## 2) Environment variables

### Frontend (`.env`, committed as `.env.example`)

| Var | Description |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `VITE_MS_CLIENT_ID` | Azure AD application (client) ID |
| `VITE_MS_TENANT_ID` | Azure tenant id or `common` |
| `VITE_MS_REDIRECT_URI` | e.g. `http://localhost:5173/ms-auth-callback` (and your Vercel URL in prod) |

### Edge Function secrets (set with the CLI — never in the frontend)

```bash
supabase secrets set \
  NVIDIA_API_KEY=nvapi-xxxx \
  NVIDIA_OCR_URL=https://integrate.api.nvidia.com/v1/chat/completions \
  NVIDIA_OCR_MODEL=nvidia/nemotron-ocr-v1 \
  AZURE_CLIENT_ID=xxxx \
  AZURE_CLIENT_SECRET=xxxx \
  AZURE_TENANT_ID=common \
  AZURE_REDIRECT_URI=https://YOUR-APP.vercel.app/ms-auth-callback \
  SEARCH_API_KEY=xxxx           # Serper.dev API key (KYC web search)
```

> `SEARCH_API_URL` is optional — it defaults to `https://google.serper.dev/search`.
> Only set it if you proxy Serper or swap providers (you'd also adapt the
> `webSearch()` parser in `enrich-kyc`).

> `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically into
> deployed Edge Functions by Supabase. For **local** `functions serve`, put them
> in `supabase/.env`.

The **HubSpot token** is entered per-user in the app's Settings page (stored in
`user_settings`), not as an env var.

---

## 3) Deploy the database + Edge Functions (Supabase)

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF

# Schema
supabase db push                 # applies supabase/migrations/*

# Edge Functions
supabase functions deploy hubspot-ingest
supabase functions deploy enrich-kyc
supabase functions deploy parse-quote
supabase functions deploy ms-auth-start
supabase functions deploy ms-auth-callback
supabase functions deploy process-email-queue
supabase functions deploy export-xlsx

# Secrets (see table above)
supabase secrets set ...
```

Auth: in the Supabase dashboard → Authentication → URL Configuration, add your
Vercel domain and `…/ms-auth-callback` to the allowed redirect URLs. For quick
testing you can disable email confirmations (Authentication → Providers → Email).

---

## 4) Azure AD app registration (Microsoft Graph)

1. Azure Portal → **App registrations** → **New registration**.
2. Supported account types: pick per your org (single-tenant or multi-tenant). Set `AZURE_TENANT_ID` accordingly (`common` for multi-tenant).
3. **Redirect URI** → platform **Single-page application (SPA)** →
   `https://YOUR-APP.vercel.app/ms-auth-callback` and `http://localhost:5173/ms-auth-callback`.
4. **API permissions** → Add → Microsoft Graph → **Delegated** → `Mail.Send` and `offline_access` → Grant admin consent if required.
5. **Certificates & secrets** → New client secret → copy the value into `AZURE_CLIENT_SECRET`.
6. Copy **Application (client) ID** → `VITE_MS_CLIENT_ID` + `AZURE_CLIENT_ID`.

> The token exchange runs in the `ms-auth-callback` Edge Function (confidential
> client with the secret). The SPA never sees the client secret.

---

## 5) HubSpot private app

1. HubSpot → Settings → Integrations → **Private Apps** → Create.
2. Scopes (read): `crm.objects.deals.read`, `crm.objects.companies.read`,
   `crm.objects.contacts.read`, `crm.objects.quotes.read`, `crm.objects.notes` (engagements), and Files read.
3. Copy the access token → paste into the app's **Settings → HubSpot** field.

---

## 6) Deploy the frontend (Vercel)

1. Push this repo to GitHub and **Import** it in Vercel.
2. Framework preset: **Vite**. Build command `npm run build`, output `dist` (already in `vercel.json`).
3. Project → Settings → **Environment Variables**: add all `VITE_*` vars.
4. Deploy. `vercel.json` rewrites all routes to `index.html` so client-side routing works.

After the first deploy, update `AZURE_REDIRECT_URI` (Supabase secret) and the Azure
SPA redirect URI to the real Vercel domain, then redeploy the two `ms-auth-*` functions.

---

## Usage flow

1. **Sign up / log in.**
2. **Settings:** paste HubSpot token, connect Microsoft mailbox, set daily send limit.
3. **Run HubSpot import** (dashboard button) → companies/deals/contacts/attachments populate.
4. Open a **company → KYC tab → Enrich KYC**; **HubSpot tab → Parse quote (OCR)** on quote attachments.
5. **Templates:** create industry-specific or generic templates with `{{company_name}}`, `{{contact_name}}`, `{{industry}}`.
6. **Dashboard:** filter/search, tick companies, **Bulk send** → choose template, set cooldown → watch the progress/status.
7. **Export current view** for Excel.

---

## How sending limits are enforced (avoiding spam flags / throttling)

- **Cooldown floor:** the worker uses `max(cooldown_seconds, 2s)`. Exchange Online caps ~30 messages/minute, so 2s/message is the hard upper bound. The UI won't let you go below 2s either.
- **Daily cap:** `user_settings.daily_send_limit` (default 500). The worker counts your `sent` messages in the last 24h; once the cap is hit, remaining `queued` rows are marked **`blocked`** with a clear message. Keep this well under Exchange's ~10,000 recipients/24h ceiling.
- **Batched invocations:** each `process-email-queue` call sends within a ~120s time budget then returns progress; the frontend re-invokes until the queue drains. For fully unattended draining, schedule the function with `pg_cron` + `pg_net` (optional upgrade).

---

## Free-tier notes

- **Supabase Free** (~500 MB DB / 1 GB storage): we store attachment **metadata + URLs**, not the PDF blobs themselves — keep it that way to conserve space.
- **Vercel Hobby:** static Vite build, low bandwidth.
- **Microsoft 365:** uses your normal mailbox; respect the rate/recipient limits above.
- **NVIDIA Build OCR:** free API key (renewable) in `NVIDIA_API_KEY`.
- **Web search:** optional; without `SEARCH_API_KEY`, KYC still records the known website and scrapes it, just without discovery search.

---

## Phase → file map

| Phase | Delivered in |
| --- | --- |
| 1. Schema, auth, dashboard | `supabase/migrations/*`, `src/pages/{Login,Signup,ForgotPassword,Dashboard,Settings}`, `src/hooks/*` |
| 2. HubSpot ingestion | `supabase/functions/hubspot-ingest`, `_shared/{hubspot,dealName}.ts`, import buttons in Dashboard/CompanyDetail |
| 3. KYC + OCR | `supabase/functions/{enrich-kyc,parse-quote}`, `src/components/{KycPanel,AttachmentList}` |
| 4. Templates + bulk email | `supabase/functions/{ms-auth-*,process-email-queue,export-xlsx}`, `src/components/{TemplateEditor,BulkSendPanel}`, `src/pages/Templates` |

---

## Notes / limitations to be aware of

## Durable email queue deployment

The browser now only enqueues mail. Supabase Cron invokes `process-email-queue` once per minute, so sending continues after the browser closes. Before pushing the branch to `main`, set the server-only `BREVO_API_KEY` only if Brevo is selected, and set `QUEUE_CRON_SECRET` for the worker with `supabase secrets set`. In Supabase Vault, create `queue_worker_url` with `https://qgcooulzzbjebwczjgis.supabase.co/functions/v1/process-email-queue` and `queue_cron_secret` with the same worker secret. The migration schedules the cron job; inspect its run history in the Supabase Dashboard after deployment.

The `unsubscribe` function is intentionally public but accepts only an opaque, hashed, expiring token. Configure the Vercel/Supabase production URLs in Supabase Authentication URL Configuration. Email domains should have SPF, DKIM, and DMARC configured; cooldowns cannot guarantee inbox placement.

- **PDF OCR:** `parse-quote` sends the file to an OpenAI-compatible NVIDIA endpoint as a data URI. Multi-page image PDFs may need page rasterization first — there's a TODO hook in `runOcr`. Confirm the exact request/response schema for the specific NIM you enable and adjust if needed.
- **Per-company delta import:** the "Run import/update" on a company currently triggers a bounded full sync. Extend `hubspot-ingest` with an association-scoped fetch if you need true per-company deltas.
- **Quote PDF links:** HubSpot quote objects don't expose a direct PDF URL via the object API; note-based file attachments are resolved via the Files API. Wire the Quotes public-link API if you need the rendered quote PDF.
