import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(new URL('./20261007122208_extend_crm_import_rpc_timeout.sql', import.meta.url), 'utf8');

describe('CRM workbook import timeout', () => {
  it('extends only the dedicated import RPC to the client API maximum', () => {
    expect(sql).toMatch(/alter function public\.crm_commit_import_with_customer_status_review\s*\([\s\S]*\)\s*set statement_timeout to '60s'/i);
    expect(sql).not.toMatch(/alter (role|database)/i);
  });
});
