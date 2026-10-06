import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(new URL('./20261006030000_customer_status_import_reconciliation.sql', import.meta.url), 'utf8');

describe('customer status import reconciliation migration', () => {
  it('persists review state without changing user-authored customer status', () => {
    expect(sql).toMatch(/alter table public\.crm_companies[\s\S]*customer_status_review_required boolean/i);
    expect(sql).toMatch(/customer_status_review_reason text/i);
    expect(sql).toMatch(/constraint crm_companies_customer_status_review_reason_length_check\s+check/i);
    expect(sql).toMatch(/crm_commit_import_with_customer_status_review/i);
    expect(sql).toMatch(/field_sources->>'customer_status'[^\n]*<> 'user'/i);
    expect(sql).toMatch(/v_base_rows[\s\S]*'\{company,field_sources\}'[\s\S]*'\{\}'::jsonb/i);
    expect(sql).toMatch(/foreach v_field_name[\s\S]*field_sources->>v_field_name[\s\S]*<> 'user'/i);
    expect(sql).toMatch(/source_revision_id[\s\S]*stable_row_fingerprint/i);
  });

  it('clears a review when a user manually changes customer status', () => {
    expect(sql).toMatch(/create function public\.crm_clear_company_status_review/i);
    expect(sql).toMatch(/before update of customer_status on public\.crm_companies/i);
    expect(sql).toMatch(/when \(old\.customer_status is distinct from new\.customer_status\)/i);
  });

  it('stores one-way pending-to-ready artifact pointers for every workbook revision', () => {
    expect(sql).toMatch(/create table public\.crm_source_revision_artifacts/i);
    expect(sql).toMatch(/unique \(workspace_id, source_revision_id\)/i);
    expect(sql).toMatch(/alter table public\.crm_source_revision_artifacts enable row level security/i);
    expect(sql).toMatch(/create policy crm_source_revision_artifacts_select_member/i);
    expect(sql).not.toMatch(/create policy crm_source_revision_artifacts_update/i);
    expect(sql).toMatch(/finalization_status text not null default 'pending'/i);
    expect(sql).toMatch(/old\.finalization_status <> 'pending'[\s\S]*new\.finalization_status <> 'ready'/i);
    expect(sql).toMatch(/insert into public\.crm_source_revision_artifacts/i);
  });
});
