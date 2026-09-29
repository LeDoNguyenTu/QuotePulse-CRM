import {describe,expect,it} from 'vitest';
import {assertArchivePayload,LEGACY_ARCHIVE_EXCLUDED,LEGACY_ARCHIVE_SCHEMA,LEGACY_ARCHIVE_TABLES,sanitizeArchiveRows} from './legacyWorkspaceArchive.ts';

describe('legacy workspace archive contract',()=>{
  it('uses an explicit allow-list that excludes auth and secret-bearing tables',()=>{expect(LEGACY_ARCHIVE_TABLES.map((item)=>item.table)).not.toContain('user_settings');expect(LEGACY_ARCHIVE_EXCLUDED).toContain('auth.users');expect(LEGACY_ARCHIVE_EXCLUDED).toContain('email_unsubscribe_tokens')});
  it('removes generated columns before storage and restore',()=>{const spec=LEGACY_ARCHIVE_TABLES.find((item)=>item.table==='companies')!;expect(sanitizeArchiveRows(spec,[{id:'1',owner_id:'owner',search_tsv:'generated'}])).toEqual([{id:'1',owner_id:'owner'}])});
  it('redacts plaintext unsubscribe bearer tokens from archived email bodies',()=>{const spec=LEGACY_ARCHIVE_TABLES.find((item)=>item.table==='email_sends')!;expect(sanitizeArchiveRows(spec,[{id:'1',created_by:'owner',body_rendered:'unsubscribe: https://example.test/u?token=secret-value'}])[0].body_rendered).toBe('unsubscribe: https://example.test/u?token=[redacted]')});
  it('rejects cross-owner or misidentified objects',()=>{const base={format:LEGACY_ARCHIVE_SCHEMA,archive_id:'a',workspace_id:'w',owner_id:'o',table:'companies',sequence:0,rows:[{id:'1',owner_id:'other'}]};expect(()=>assertArchivePayload(base,{archiveId:'a',workspaceId:'w',ownerId:'o',table:'companies',sequence:0})).toThrow(/out-of-scope/);expect(()=>assertArchivePayload({...base,rows:[],table:'user_settings'},{archiveId:'a',workspaceId:'w',ownerId:'o',table:'user_settings',sequence:0})).toThrow(/allow-listed/) });
});
