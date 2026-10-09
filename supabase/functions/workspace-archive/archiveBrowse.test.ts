import { describe, expect, it, vi } from 'vitest';
import { archiveObjectsScanned, createArchiveCursor, decodeArchiveCursor, hydrateArchivedDealRow, prepareArchiveBrowseRow, pageArchiveRows, projectArchiveRow } from './archiveBrowse';

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

  it('projects every live-ledger field while omitting ownership and internal metadata', () => {
    expect(projectArchiveRow('companies', { id: '1', name_clean: 'Northstar', source_priority: 'current', hubspot_properties: { city: 'Singapore' }, owner_id: 'u', search_tsv: 'internal', r2_key: 'secret' })).toEqual({ id: '1', name_clean: 'Northstar', source_priority: 'current', hubspot_properties: { city: 'Singapore' } });
    expect(projectArchiveRow('deals', { id: '2', deal_name_raw: 'Renewal', deal_stage: 'won', hubspot_modified_at: '2026-10-01', owner_id: 'u' })).toEqual({ id: '2', deal_name_raw: 'Renewal', deal_stage: 'won', hubspot_modified_at: '2026-10-01' });
    expect(projectArchiveRow('contacts', { id: '3', full_name: 'Avery', role_title: 'Director', source: 'hubspot_contact', hubspot_contact_id: 'hs-3', owner_id: 'u' })).toEqual({ id: '3', full_name: 'Avery', role_title: 'Director', source: 'hubspot_contact', hubspot_contact_id: 'hs-3' });
    expect(() => projectArchiveRow('user_settings', { id: '1' })).toThrow(/allow-listed/);
  });

  it('reports cumulative archive objects scanned across bounded requests', () => {
    expect(archiveObjectsScanned(2, 0, 20)).toBe(2);
    expect(archiveObjectsScanned(2, 4, 20)).toBe(3);
    expect(archiveObjectsScanned(30, 0, 20)).toBe(20);
  });

  it('hydrates cold-archived deal properties through the verified nested R2 payload', async () => {
    const load = vi.fn().mockResolvedValue({ deals: [{ id: 'deal-1', properties: { region: 'APAC' } }] });
    const row = await hydrateArchivedDealRow({ id: 'deal-1', hubspot_properties: {}, r2_archive_key: 'owners/u/deal-batches/1.json', r2_archive_sha256: 'sha' }, load);
    expect(row.hubspot_properties).toEqual({ region: 'APAC' });
    expect(load).toHaveBeenCalledWith('owners/u/deal-batches/1.json', 'sha');
  });

  it('filters on normalized fields before hydrating a cold deal', async () => {
    const hydrate = vi.fn();
    await expect(prepareArchiveBrowseRow('deals', { id: 'deal-1', deal_name_raw: 'Renewal' }, 'missing', hydrate)).resolves.toBeNull();
    expect(hydrate).not.toHaveBeenCalled();

    hydrate.mockResolvedValue({ id: 'deal-1', deal_name_raw: 'Renewal', hubspot_properties: { region: 'APAC' } });
    await expect(prepareArchiveBrowseRow('deals', { id: 'deal-1', deal_name_raw: 'Renewal' }, 'renewal', hydrate)).resolves.toMatchObject({ hubspot_properties: { region: 'APAC' } });
    expect(hydrate).toHaveBeenCalledOnce();
  });
});
