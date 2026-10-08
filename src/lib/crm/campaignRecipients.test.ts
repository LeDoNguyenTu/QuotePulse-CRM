import { describe, expect, it } from 'vitest';
import { addRecipients, clearRecipients, collectRecipientPages, removeRecipient, type CampaignRecipient } from './campaignRecipients';

const recipient = (id: string, email = `${id}@example.com`): CampaignRecipient => ({
  contact_id: id, company_id: null, contact_name: id, email_normalized: email,
  company_name: null, industry: null,
});

describe('campaign recipient selection', () => {
  it('unions filtered result sets and deduplicates by normalized email', () => {
    const first = addRecipients([], [recipient('a'), recipient('b')]);
    const second = addRecipients(first, [recipient('c'), recipient('duplicate', 'A@example.com')]);
    expect(second.map((item) => item.contact_id)).toEqual(['a', 'b', 'c']);
  });

  it('removes recipients individually and clears only when explicitly requested', () => {
    const selected = [recipient('a'), recipient('b')];
    expect(removeRecipient(selected, 'a').map((item) => item.contact_id)).toEqual(['b']);
    expect(clearRecipients(selected)).toEqual([]);
    expect(selected).toHaveLength(2);
  });

  it('rejects additions above the 5,000-recipient limit without changing selection', () => {
    const selected = [recipient('kept')];
    const additions = Array.from({ length: 5000 }, (_, index) => recipient(`new-${index}`));
    expect(() => addRecipients(selected, additions)).toThrow(/5,000/);
    expect(selected.map((item) => item.contact_id)).toEqual(['kept']);
  });

  it('collects every matching page instead of only the visible page', async () => {
    const pages = [[recipient('a'), recipient('b')], [recipient('c')]];
    const result = await collectRecipientPages(async (from) => pages[from / 2] ?? [], 2);
    expect(result.map((item) => item.contact_id)).toEqual(['a', 'b', 'c']);
  });
});
