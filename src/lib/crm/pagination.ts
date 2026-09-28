export const CRM_PAGE_SIZE = 25;

export function normalizeCrmPage(page: number): number {
  return Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
}

export function crmPageRange(page: number): { from: number; to: number } {
  const normalized = normalizeCrmPage(page);
  const from = (normalized - 1) * CRM_PAGE_SIZE;
  return { from, to: from + CRM_PAGE_SIZE - 1 };
}

export function crmPageCount(count: number): number {
  return Math.max(1, Math.ceil(Math.max(0, count) / CRM_PAGE_SIZE));
}

export function pageAfterDelete(page: number, visibleRowCount: number): number {
  return page > 1 && visibleRowCount <= 1 ? page - 1 : page;
}
