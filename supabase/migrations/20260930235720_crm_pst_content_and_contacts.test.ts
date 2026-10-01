import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const sql = readFileSync(fileURLToPath(new URL('./20260930235720_crm_pst_content_and_contacts.sql', import.meta.url)), 'utf8');
describe('PST content and contacts migration',()=>{
  it('stores bounded previews and verified archive pointers',()=>{expect(sql).toContain('body_preview');expect(sql).toContain('archive_sha256');expect(sql).toContain('mailbox archive count mismatch')});
  it('deduplicates contacts by workspace email and links messages',()=>{expect(sql).toContain('crm_contacts_workspace_email_uidx');expect(sql).toContain('crm_mail_message_contacts');expect(sql).toContain('on conflict do nothing')});
});
