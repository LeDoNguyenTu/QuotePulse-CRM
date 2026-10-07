import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(new URL('./20261007125000_expand_crm_company_name_limit.sql', import.meta.url), 'utf8');

describe('CRM company name limit migration', () => {
  it('widens the company name constraint without removing its lower bound', () => {
    expect(sql).toMatch(/drop constraint crm_companies_name_check/i);
    expect(sql).toMatch(/length\(btrim\(name\)\) between 1 and 500/i);
  });
});
