export async function collectCrmOptionPages<T>(
  fetchPage: (from: number, to: number) => Promise<T[]>,
  pageSize = 500,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const page = await fetchPage(from, from + pageSize - 1);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

export const CRM_CUSTOMER_STATUSES = [
  'Current Customer',
  'Prospect',
  'Former Customer',
  'Maintenance Customer',
] as const;

export function mergeCustomerStatusOptions(values: Array<string | null | undefined>) {
  return [...new Set([
    ...CRM_CUSTOMER_STATUSES,
    ...values.map((value) => value?.trim() ?? '').filter(Boolean),
  ])];
}
