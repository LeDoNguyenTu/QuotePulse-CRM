import { describe, expect, it } from 'vitest';
import type { CrmContact } from './types';
import {
  contactStateIndicators,
  outdatedContactIds,
} from './contactLifecycle';

function contact(overrides: Partial<CrmContact> = {}): CrmContact {
  return {
    id: 'contact-1', workspace_id: 'workspace-1', company_id: null,
    first_name: 'Ada', last_name: 'Lovelace', full_name: 'Ada Lovelace',
    email: 'ada@example.com', phone: '123', job_title: 'Founder',
    record_state: 'unverified', is_hidden: false, duplicate_review_of: null,
    created_by: 'user-1', updated_by: 'user-1',
    created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
    ...overrides,
  };
}

describe('contact lifecycle presentation and bulk selection', () => {
  it('presents the record state plus independent review and hidden indicators', () => {
    expect(contactStateIndicators(contact({ record_state: 'verified' }))).toEqual(['Verified']);
    expect(contactStateIndicators(contact({
      record_state: 'outdated', duplicate_review_of: 'contact-2', is_hidden: true,
    }))).toEqual(['Outdated', 'Review required', 'Hidden']);
  });

  it('selects only visible outdated contacts from an explicit selection', () => {
    const rows = [
      contact({ id: 'old', record_state: 'outdated' }),
      contact({ id: 'verified', record_state: 'verified' }),
      contact({ id: 'hidden', record_state: 'outdated', is_hidden: true }),
    ];
    expect(outdatedContactIds(rows, new Set(['old', 'verified', 'hidden']))).toEqual(['old']);
  });

  it('falls back to all currently loaded visible outdated rows when nothing is selected', () => {
    const rows = [
      contact({ id: 'old-1', record_state: 'outdated' }),
      contact({ id: 'old-2', record_state: 'outdated' }),
      contact({ id: 'current', record_state: 'unverified' }),
    ];
    expect(outdatedContactIds(rows, new Set())).toEqual(['old-1', 'old-2']);
  });
});
