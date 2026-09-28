import { readFileSync } from 'node:fs';
import { describe,expect,it } from 'vitest';
const sql=readFileSync(new URL('./20260929045500_phase_h_pst_metadata.sql',import.meta.url),'utf8');

describe('Phase H PST metadata storage',()=>{
  it('stores metadata only with workspace RLS',()=>{expect(sql).toMatch(/crm_mailbox_imports/);expect(sql).toMatch(/crm_mail_messages/);expect(sql).not.toMatch(/\bbody\b|attachment_data/i);expect(sql).toMatch(/enable row level security/i);expect(sql).toMatch(/i\.status in \('completed','completed_with_warnings'\)/)});
  it('uses bounded validated definer RPCs',()=>{expect(sql).toMatch(/security definer set search_path=''/i);expect(sql).toMatch(/at most 500 messages/i);expect(sql).toMatch(/at most 200 addresses/i);expect(sql).toMatch(/metadata count mismatch/i);expect(sql).toMatch(/400 MiB or smaller/i);expect(sql).toMatch(/workspace_members/i)});
  it('cleans partial batches while preserving completed duplicates',()=>{expect(sql).toMatch(/crm_abort_mailbox_import/);expect(sql).toMatch(/delete from public\.crm_mailbox_imports[\s\S]+status='processing'/);expect(sql).toMatch(/status='processing',completed_at=null[\s\S]+delete from public\.crm_mail_messages/);expect(sql).toMatch(/where crm_mailbox_imports\.status not in \('completed','completed_with_warnings'\)/);expect(sql).toMatch(/if v_status in \('completed','completed_with_warnings'\) then return/)});
});
