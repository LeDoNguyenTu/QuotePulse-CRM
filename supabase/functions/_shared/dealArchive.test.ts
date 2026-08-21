import { describe, expect, it } from 'vitest';
import { assertDealArchivePointer, propertiesForDeal } from './dealArchive.ts';

describe('deal archive reads', () => {
  it('rejects pointers outside the authenticated owner scope', () => {
    expect(() => assertDealArchivePointer('owners/other/deals/deal-a/v.json.gz', 'owner-a'))
      .toThrow(/scope/i);
  });

  it('reads an individual ingest archive', () => {
    expect(propertiesForDeal({ hubspot_deal_id: 'hs-1', properties: { custom: 'value' } }, 'deal-a'))
      .toEqual({ custom: 'value' });
  });

  it('reads a deal from a migration batch archive', () => {
    const payload = { deals: [
      { id: 'deal-a', hubspot_deal_id: 'hs-1', properties: { custom: 'one' } },
      { id: 'deal-b', hubspot_deal_id: 'hs-2', properties: { custom: 'two' } },
    ] };
    expect(propertiesForDeal(payload, 'deal-b')).toEqual({ custom: 'two' });
  });
});
