type DealPropertyRow = {
  id: string;
  hubspot_properties: Record<string, string | null>;
};

export async function restoreArchivedDealProperties<T extends DealPropertyRow>(
  rows: T[],
  load: (dealIds: string[]) => Promise<Record<string, Record<string, string | null>>>,
): Promise<void> {
  const archivedIds = rows
    .filter((row) => !row.hubspot_properties || Object.keys(row.hubspot_properties).length === 0)
    .map((row) => row.id);
  if (archivedIds.length === 0) return;

  const archived = await load(archivedIds);
  for (const row of rows) {
    if (archived[row.id]) row.hubspot_properties = archived[row.id];
  }
}
