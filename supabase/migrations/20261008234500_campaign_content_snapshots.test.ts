import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(new URL('./20261008234500_campaign_content_snapshots.sql', import.meta.url), 'utf8');

describe('campaign content snapshot migration', () => {
  it('stores immutable HTML and text snapshots on campaigns and sends', () => {
    expect(sql).toMatch(/crm_email_campaigns[\s\S]+body_html[\s\S]+body_text/i);
    expect(sql).toMatch(/p_body_html text[\s\S]+p_body_text text/i);
    expect(sql).toMatch(/body_html_rendered[\s\S]+p_body_html/i);
    expect(sql).toMatch(/body_rendered[\s\S]+p_body_text/i);
  });

  it('keeps explicit recipients owner scoped and capped', () => {
    expect(sql).toMatch(/cardinality\(p_contact_ids\)[\s\S]+5000/i);
    expect(sql).toMatch(/ct\.id = any\(p_contact_ids\)/i);
    expect(sql).toMatch(/workspace_members[\s\S]+auth\.uid\(\)/i);
  });

  it('validates but does not reread mutable template content', () => {
    expect(sql).toMatch(/template not found/i);
    expect(sql).not.toMatch(/select\s+template\.body_html/i);
  });
});
