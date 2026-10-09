import{readFileSync}from'node:fs';import{describe,expect,it}from'vitest';const source=readFileSync(new URL('./index.ts',import.meta.url),'utf8');const relationshipSource=`${source}\n${readFileSync(new URL('./archiveCompanyBundle.ts',import.meta.url),'utf8')}`;
describe('workspace archive workflow',()=>{it('supports bounded leased keyset archive and restore actions',()=>{expect(source).toMatch(/LEGACY_ARCHIVE_CHUNK_ROWS/);expect(source).toMatch(/leaseToken/);expect(source).toMatch(/highWater/);expect(source).toMatch(/manifestChecksum/);expect(source).toMatch(/\.gt\(spec\.cursorColumn/);expect(source).not.toMatch(/cursor_offset|\.range\(state/);expect(source).toMatch(/archiveStep/);expect(source).toMatch(/restoreStep/)});it('verifies archive objects in bounded batches before guarded deletion',()=>{expect(source).toMatch(/Deletion refused: archive is not verified/);expect(source).toMatch(/legacy data changed after this archive/);expect(source).toMatch(/DELETION_VERIFY_BATCH/);expect(source).toMatch(/deletion_verified_at/);expect(source).toMatch(/mark_legacy_workspace_archive_deletion_eligible/);expect(source).toMatch(/deleteStep/);expect(source).toMatch(/delete_legacy_workspace_archive_batch/);expect(source).toMatch(/confirmation/);expect(source).not.toMatch(/\.delete\(/)});it('enforces current ownership and preflights restore conflicts across all owners',()=>{expect(source).toMatch(/workspace_members/);expect(source).toMatch(/Current legacy workspace owner membership required/);expect(source).toMatch(/a primary key belongs to another owner/);expect(source).toMatch(/\.eq\(spec\.ownerColumn,userId\)/);expect(source).toMatch(/assertArchivePayload/)})
  it('builds and reads owner-scoped company relationships in bounded verified batches',()=>{
    expect(relationshipSource).toMatch(/RELATIONSHIP_INDEX_BATCH/);
    expect(relationshipSource).toMatch(/prepareRelationshipIndex/);
    expect(relationshipSource).toMatch(/companyArchiveBundle/);
    expect(source).toMatch(/const companyBloom=.*createCompanyBloom\(rows\)/);
    expect(source).toMatch(/company_bloom:companyBloom/);
    expect(source).toMatch(/action==='prepare_relationships'/);
    expect(source).toMatch(/action==='company_bundle'/);
    expect(relationshipSource).toMatch(/\.eq\('workspace_id',\s*archive\.workspace_id\)/);
    expect(relationshipSource).toMatch(/verifyArchivePayload/);
    expect(relationshipSource).toMatch(/createArchiveCursor/);
  });
});
