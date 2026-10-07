import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(new URL('./20261007121516_allow_crm_revision_artifact_insert.sql', import.meta.url), 'utf8');

describe('CRM revision artifact insert privileges', () => {
  it('allows authenticated workspace members to create only their own pending revision artifact', () => {
    expect(sql).toMatch(/grant insert on table public\.crm_source_revision_artifacts to authenticated/i);
    expect(sql).toMatch(/create policy crm_source_revision_artifacts_insert_member/i);
    expect(sql).toMatch(/for insert to authenticated[\s\S]*with check/i);
    expect(sql).toMatch(/created_by = \(select auth\.uid\(\)\)/i);
    expect(sql).toMatch(/workspace_members[\s\S]*member\.workspace_id = crm_source_revision_artifacts\.workspace_id[\s\S]*member\.user_id = \(select auth\.uid\(\)\)/i);
    expect(sql).toMatch(/finalization_status = 'pending'/i);
  });
});
