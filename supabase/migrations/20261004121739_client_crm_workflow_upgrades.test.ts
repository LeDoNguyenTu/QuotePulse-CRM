import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL('./20261004121739_client_crm_workflow_upgrades.sql', import.meta.url);
const migrationPath = fileURLToPath(migrationUrl);
const sql = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';

describe('client CRM workflow upgrade migration', () => {
  it('adds customer and contact lifecycle fields without hiding duplicates by default', () => {
    expect(sql).toMatch(/alter table public\.crm_companies[\s\S]*add column[^;]*customer_status text/i);
    expect(sql).toMatch(/alter table public\.crm_contacts[\s\S]*record_state text[^;]*default 'unverified'/i);
    expect(sql).toMatch(/record_state in \('unverified', 'verified', 'outdated'\)/i);
    expect(sql).toMatch(/is_hidden boolean[^;]*default false/i);
    expect(sql).toMatch(/duplicate_review_of uuid/i);
    expect(sql).toMatch(/foreign key \(workspace_id, duplicate_review_of\)[\s\S]*crm_contacts \(workspace_id, id\)/i);
  });

  it('keeps deal stage separate from call outcome and appointment status', () => {
    expect(sql).toMatch(/alter table public\.crm_deals[\s\S]*add column[^;]*call_outcome text/i);
    expect(sql).toMatch(/alter table public\.crm_deals[\s\S]*add column[^;]*appointment_status text/i);
    expect(sql).not.toMatch(/rename column stage/i);
  });

  it('adds editable activity audit fields', () => {
    expect(sql).toMatch(/alter table public\.crm_activities[\s\S]*call_outcome text/i);
    expect(sql).toMatch(/updated_by uuid/i);
    expect(sql).toMatch(/updated_at timestamptz/i);
    expect(sql).toMatch(/crm_activities_updated_at[\s\S]*public\.set_updated_at\(\)/i);
  });

  it('adds stable workbook and row identity with revision history', () => {
    expect(sql).toMatch(/crm_source_imports[\s\S]*workbook_identity text/i);
    expect(sql).toMatch(/create table public\.crm_source_revisions/i);
    expect(sql).toMatch(/stable_row_fingerprint text/i);
    expect(sql).toMatch(/unique index crm_source_references_stable_row_entity_uidx[\s\S]*workspace_id,\s*source_revision_id,\s*stable_row_fingerprint[\s\S]*case/i);
  });

  it('changes only the default for new short database IDs and keeps legacy IDs valid', () => {
    expect(sql).toMatch(/create or replace function public\.crm_short_database_id/i);
    expect(sql).toMatch(/v_result text := 'DB-'[\s\S]*for v_index in 1\.\.6 loop/i);
    expect(sql).toMatch(/alter table public\.crm_source_imports[\s\S]*set default public\.crm_short_database_id\(\)/i);
    expect(sql).toMatch(/database_id[^;]*\^\(CRM-\[A-Z0-9\]\{12\}\|DB-\[A-HJ-NP-Z2-9\]\{6\}\)\$/i);
  });

  it('adds plain-compatible rich email template fields', () => {
    expect(sql).toMatch(/alter table public\.email_templates[\s\S]*body_format text[^;]*default 'plain'/i);
    expect(sql).toMatch(/body_format in \('plain', 'html'\)/i);
    expect(sql).toMatch(/body_html text/i);
    expect(sql).toMatch(/asset_manifest jsonb/i);
  });

  it('adds workspace-scoped indexes for the new query paths', () => {
    expect(sql).toMatch(/crm_contacts_workspace_state_visibility_idx[\s\S]*workspace_id, is_hidden, record_state/i);
    expect(sql).toMatch(/crm_contacts_workspace_duplicate_review_idx[\s\S]*workspace_id, duplicate_review_of/i);
    expect(sql).toMatch(/crm_source_imports_workspace_identity_idx[\s\S]*workspace_id, workbook_identity/i);
    expect(sql).toMatch(/crm_activities_workspace_company_occurred_idx[\s\S]*workspace_id, company_id, occurred_at desc/i);
    expect(sql).toMatch(/crm_notifications_workspace_user_due_idx[\s\S]*workspace_id, user_id, status, due_at/i);
  });

  it('keeps new revision data tenant-isolated and explicitly granted', () => {
    expect(sql).toMatch(/alter table public\.crm_source_revisions enable row level security/i);
    expect(sql).toMatch(/create policy crm_source_revisions_select_member/i);
    expect(sql).toMatch(/workspace_members[\s\S]*auth\.uid\(\)/i);
    expect(sql).toMatch(/grant select, insert, delete on table public\.crm_source_revisions to authenticated/i);
    expect(sql).not.toMatch(/create policy crm_source_revisions_update/i);
    expect(sql).toMatch(/grant all on table public\.crm_source_revisions to service_role/i);
  });

  it('reconciles repeated workbook revisions instead of creating a new database', () => {
    expect(sql).toMatch(/crm_commit_import_with_activities[\s\S]*p_workbook_identity text/i);
    expect(sql).toMatch(/from public\.crm_source_imports[\s\S]*workbook_identity = p_workbook_identity/i);
    expect(sql).toMatch(/insert into public\.crm_source_revisions/i);
    expect(sql).toMatch(/source_revision_id uuid/i);
    expect(sql).toMatch(/stable_row_fingerprint/i);
    expect(sql).toMatch(/'updated_rows'/i);
    expect(sql).toMatch(/'unchanged_rows'/i);
    expect(sql).toMatch(/'duplicate_review_rows'/i);
  });

  it('flags older name-and-phone duplicates without automatically hiding them', () => {
    expect(sql).toMatch(/record_state = case[\s\S]*when record_state = 'verified' then record_state[\s\S]*else 'outdated'/i);
    expect(sql).toMatch(/duplicate_review_of = v_contact_id/i);
    expect(sql).not.toMatch(/duplicate_review_of = v_contact_id[\s\S]{0,180}is_hidden = true/i);
  });

  it('updates source-linked records and reconciles activities by stable row identity', () => {
    expect(sql).toMatch(/update public\.crm_companies/i);
    expect(sql).toMatch(/update public\.crm_contacts/i);
    expect(sql).toMatch(/update public\.crm_deals/i);
    expect(sql).toMatch(/update public\.crm_activities[\s\S]*stable_row_fingerprint/i);
    expect(sql).not.toMatch(/delete from public\.crm_(companies|contacts|deals)/i);
  });

  it('lists contacts by role and lifecycle while hiding hidden records by default', () => {
    expect(sql).toMatch(/create or replace function public\.crm_list_contacts[\s\S]*p_record_state text[\s\S]*p_visibility text default 'visible'[\s\S]*p_duplicate_review boolean/i);
    expect(sql).toMatch(/concat_ws\([^;]*c\.job_title[^;]*company\.name[^;]*c\.phone[^;]*c\.email[^;]*c\.full_name/i);
    expect(sql).toMatch(/p_visibility = 'visible'[\s\S]*not c\.is_hidden/i);
    expect(sql).toMatch(/p_duplicate_review = true[\s\S]*c\.duplicate_review_of is not null/i);
  });

  it('bulk hides only outdated visible contacts in the active workspace', () => {
    expect(sql).toMatch(/create or replace function public\.crm_hide_outdated_contacts/i);
    expect(sql).toMatch(/update public\.crm_contacts c[\s\S]*set is_hidden = true[\s\S]*c\.workspace_id = p_workspace_id[\s\S]*c\.record_state = 'outdated'[\s\S]*not c\.is_hidden/i);
    expect(sql).toMatch(/workspace_members[\s\S]*auth\.uid\(\)/i);
  });

  it('projects derived company activity summaries and customer status filtering', () => {
    expect(sql).toMatch(/create or replace function public\.crm_list_companies[\s\S]*p_customer_status text/i);
    expect(sql).toMatch(/'last_contact_at'[\s\S]*'follow_up_at'[\s\S]*'last_call_outcome'[\s\S]*'latest_activity_at'[\s\S]*'latest_activity_preview'/i);
    expect(sql).toMatch(/crm_activities[\s\S]*occurred_at[\s\S]*crm_tasks[\s\S]*due_at[\s\S]*crm_deals[\s\S]*follow_up_at/i);
  });
});
