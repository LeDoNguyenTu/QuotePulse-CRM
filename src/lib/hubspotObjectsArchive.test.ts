import { describe, expect, it, vi } from 'vitest';
import { restoreArchivedDealProperties } from './hubspotObjectsArchive';

describe('archived deal table hydration', () => {
  it('does not add network work when every deal still has live properties', async () => {
    const load = vi.fn();
    const rows = [{ id: 'live', hubspot_properties: { custom: 'value' } }];
    await restoreArchivedDealProperties(rows, load);
    expect(load).not.toHaveBeenCalled();
  });

  it('loads only empty snapshots and preserves the row shape', async () => {
    const rows: Array<{ id: string; hubspot_properties: Record<string, string | null> }> = [
      { id: 'live', hubspot_properties: { custom: 'live' } },
      { id: 'archived', hubspot_properties: {} },
    ];
    const load = vi.fn().mockResolvedValue({ archived: { custom: 'restored' } });
    await restoreArchivedDealProperties(rows, load);
    expect(load).toHaveBeenCalledWith(['archived']);
    expect(rows[1].hubspot_properties).toEqual({ custom: 'restored' });
  });
});
