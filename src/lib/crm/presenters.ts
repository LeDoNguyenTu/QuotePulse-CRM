export function displayText(value: string | null | undefined, fallback = '—'): string {
  return value?.trim() || fallback;
}

export function formatCrmDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-SG', { dateStyle: 'medium' }).format(date);
}

export function formatCrmMoney(amount: number | null, currency: string): string {
  if (amount === null) return '—';
  try {
    return new Intl.NumberFormat('en-SG', { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString('en-SG')}`;
  }
}
