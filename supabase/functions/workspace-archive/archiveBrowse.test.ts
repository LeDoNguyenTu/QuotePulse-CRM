import { describe, expect, it } from 'vitest';
import { createArchiveCursor, decodeArchiveCursor, pageArchiveRows, projectArchiveRow } from './archiveBrowse';

describe('archive browse primitives', () => {
  it('signs cursor scope and rejects tampering or cross-owner reuse', async () => {
    const cursor = await createArchiveCursor('secret', { archiveId: 'a', workspaceId: 'w', ownerId: 'u', table: 'companies', sequence: 2, offset: 4 });
    await expect(decodeArchiveCursor('secret', cursor, { archiveId: 'a', workspaceId: 'w', ownerId: 'u', table: 'companies' })).resolves.toMatchObject({ sequence: 2, offset: 4 });
    await expect(decodeArchiveCursor('secret', `${cursor}x`, { archiveId: 'a', workspaceId: 'w', ownerId: 'u', table: 'companies' })).rejects.toThrow(/cursor/i);
    await expect(decodeArchiveCursor('secret', cursor, { archiveId: 'a', workspaceId: 'w', ownerId: 'other', table: 'companies' })).rejects.toThrow(/cursor/i);
  });

  it('bounds normal pages to two objects and returns an opaque continuation position', () => {
    const result = pageArchiveRows([[{ id: '1' }, { id: '2' }], [{ id: '3' }, { id: '4' }], [{ id: '5' }]], { pageSize: 3, sequence: 0, offset: 0 });
    expect(result.rows.map((row) => row.id)).toEqual(['1', '2', '3']);
    expect(result.objectsRead).toBe(2);
    expect(result.next).toEqual({ sequence: 1, offset: 1 });
    expect(() => pageArchiveRows([], { pageSize: 101, sequence: 0, offset: 0 })).toThrow(/100/);
  });

  it('projects allow-listed display fields without object metadata or secret bodies', () => {
    expect(projectArchiveRow('companies', { id: '1', name_clean: 'Northstar', owner_id: 'u', r2_key: 'secret' })).toEqual({ id: '1', name_clean: 'Northstar' });
    expect(projectArchiveRow('deals', { id: '2', deal_name_raw: 'Renewal', deal_stage: 'won', owner_id: 'u' })).toEqual({ id: '2', deal_name_raw: 'Renewal', deal_stage: 'won' });
    expect(() => projectArchiveRow('user_settings', { id: '1' })).toThrow(/allow-listed/);
  });
});
