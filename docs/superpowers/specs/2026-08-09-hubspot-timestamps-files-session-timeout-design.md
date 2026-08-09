# HubSpot Timestamp, Files, and Session Timeout Design

## Goal

Make HubSpot sync resilient to blank source timestamps, stop unsupported Files API work without deleting attachment references, and let each CRM owner configure or disable the application's idle sign-out.

## Approved behavior

- Normalize blank, whitespace-only, and invalid HubSpot timestamp strings to `null` before writing `deals.hubspot_created_at` or `deals.hubspot_modified_at`.
- Preserve the original values in `deals.hubspot_properties` for auditability.
- Temporarily disable Files API metadata lookup and historic attachment metadata repair.
- Continue saving attachment references with placeholder names so no existing or newly discovered relationship is deleted.
- Do not show the unavailable Files-scope warning while file metadata work is disabled. Quote OCR remains unavailable for private HubSpot files.
- Deduplicate identical accumulated import errors so retries do not produce hundreds of copies of the same message.
- Add a private per-owner `session_timeout_minutes` setting. The database default is `120`; `0` disables automatic idle sign-out.
- Allow values from 5 minutes through 10,080 minutes (7 days), plus disabled.
- Apply setting changes to the active browser session after save without requiring a new login.
- Keep Supabase automatic access-token refresh enabled. This setting controls the application's explicit idle sign-out only.

## Data and security

`session_timeout_minutes` lives on the existing RLS-protected `public.user_settings` row. Browser reads and writes remain constrained to `user_id = auth.uid()` by the existing owner policy. The migration adds a database check constraint so invalid values cannot be inserted outside the UI.

No production customer records are required for implementation or verification. Tests use pure functions, synthetic settings values, and the local Supabase stack.

## Verification

- Unit tests for timestamp normalization, unique error accumulation, and timeout conversion/deadline behavior.
- Local migration reset and schema assertion for the new column, default, and constraint.
- Full Vitest suite, TypeScript typecheck, ESLint, and production build.
- Local browser verification of the Settings control using synthetic/local data only.

