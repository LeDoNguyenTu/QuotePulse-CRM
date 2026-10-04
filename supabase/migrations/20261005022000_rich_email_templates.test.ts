import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const sql = readFileSync(fileURLToPath(new URL('./20261005022000_rich_email_templates.sql', import.meta.url)), 'utf8');

describe('rich email template migration', () => {
  it('creates a public image-only asset bucket with owner-prefixed write policies', () => {
    expect(sql).toContain("'email-assets'");
    expect(sql).toMatch(/'email-assets',\s*'email-assets',\s*true/i);
    expect(sql).toMatch(/storage\.foldername\(name\)\)\[1\].*auth\.uid\(\)::text/is);
  });

  it('snapshots template HTML into queued sends', () => {
    expect(sql).toMatch(/add column if not exists body_html_rendered text/i);
    expect(sql).toContain('snapshot_email_template_html');
    expect(sql).toMatch(/before insert on public\.email_sends/i);
  });
});
