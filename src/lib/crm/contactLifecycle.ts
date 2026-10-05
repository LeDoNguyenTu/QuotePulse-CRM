import type { CrmContact } from './types';

export function contactStateIndicators(contact: Pick<CrmContact, 'record_state' | 'is_hidden' | 'duplicate_review_of'>) {
  const labels = [contact.record_state === 'verified'
    ? 'Verified'
    : contact.record_state === 'outdated'
      ? 'Outdated'
      : 'Unverified'];
  if (contact.duplicate_review_of) labels.push('Review required');
  if (contact.is_hidden) labels.push('Hidden');
  return labels;
}

export function outdatedContactIds(
  rows: Array<Pick<CrmContact, 'id' | 'record_state' | 'is_hidden'>>,
  selectedIds: ReadonlySet<string>,
) {
  const candidates = selectedIds.size > 0
    ? rows.filter((row) => selectedIds.has(row.id))
    : rows;
  return candidates
    .filter((row) => row.record_state === 'outdated' && !row.is_hidden)
    .map((row) => row.id);
}
