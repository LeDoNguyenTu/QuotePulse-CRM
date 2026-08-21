export type DealProperties = Record<string, string | null>;

type IndividualDealArchive = {
  hubspot_deal_id: string;
  properties: DealProperties;
};

type DealBatchArchive = {
  deals: Array<IndividualDealArchive & { id: string }>;
};

export function assertDealArchivePointer(key: string, ownerId: string): void {
  const individualPrefix = `owners/${ownerId}/deals/`;
  const batchPrefix = `owners/${ownerId}/deal-batches/`;
  if (!key.startsWith(individualPrefix) && !key.startsWith(batchPrefix)) {
    throw new Error('Deal archive pointer is outside the authenticated owner scope.');
  }
}

export function propertiesForDeal(payload: unknown, dealId: string): DealProperties | null {
  if (!payload || typeof payload !== 'object') return null;
  const value = payload as Partial<IndividualDealArchive & DealBatchArchive>;
  if (Array.isArray(value.deals)) {
    return value.deals.find((deal) => deal.id === dealId)?.properties ?? null;
  }
  return value.properties ?? null;
}
