# Singapore-first MNC Job Intelligence Design

## Goal

Turn Job Intelligence into a broad, compliant MNC vacancy finder that prioritises Singapore while preserving official application links and requiring the user to confirm newly discovered sources.

## Source model

- Direct sources: Greenhouse, Lever, SmartRecruiters, and Ashby. These official public APIs can be fetched and normalised directly.
- Employer-domain discovery: a public company careers URL scopes Serper results to that employer domain. QuotePulse never directly fetches the configured URL.
- Portal discovery sources: LinkedIn, MyCareersFuture, JobStreet, Indeed Singapore, Foundit, FastJobs, Glints, Careers@Gov, and Workday-hosted MNC boards. These are discovered through the configured Serper search service and stored as link-only results; QuotePulse never crawls restricted portal pages or submits applications.
- Singapore is the default market. Portal queries include Singapore, and the UI labels Singapore matches without discarding global roles from direct MNC feeds.

## KYC-assisted setup

KYC enrichment searches for a careers page, inspects links from the official company site, and recognises supported ATS URLs. It stores deduplicated candidates in `kyc_profiles.enriched_data.job_source_candidates`. The Job Intelligence panel presents each candidate for explicit confirmation. Confirming a candidate creates the owner-scoped source configuration and immediately refreshes the company jobs.

## Persistence and tenancy

`job_source_configs` gains the additional providers and a `market` column defaulting to `Singapore`. Existing RLS remains owner-scoped. All Edge Function reads and writes retain explicit `owner_id` filters because the service role bypasses RLS.

`job_opportunities` keeps one row per source posting. A provider-neutral `canonical_fingerprint`, built from Unicode-preserving normalised title and location, lets the UI group crossposts while retaining every source link. Direct-source scans may close postings that disappear after a successful full scan. Search-based portal and employer-domain scans do not infer closure from absence because search results are not exhaustive. Generic employer URLs are used only to scope public search and are never fetched directly.

## Failure behaviour

One provider failure does not discard results from successful providers. Invalid or non-HTTPS URLs are rejected. Only exact, allowlisted portal hosts are classified. The UI reports source-specific errors and keeps the last successful data.

## Verification

Pure adapters, URL detection, search normalisation, canonical grouping, and source validation receive unit tests. The local database reset verifies the migration without production data. The full test, typecheck, lint, and build commands must pass before handoff.
