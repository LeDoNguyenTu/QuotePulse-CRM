import { describe, expect, it } from 'vitest';
import { validateCrmCampaignInput, type CrmCampaignInput } from './campaignInput';
const valid: CrmCampaignInput = { name: 'Renewals', subject: 'Hello', body: 'Body', provider: 'microsoft_graph', cooldownSeconds: 60, contactIds: ['contact-1'], industries: [], search: '', consentConfirmed: true, sendAllMatching: false, matchingCount: 1 };
describe('CRM campaign input', () => {
  it('requires content, consent, and a safe cooldown', () => {
    expect(validateCrmCampaignInput(valid)).toBeNull();
    expect(validateCrmCampaignInput({ ...valid, consentConfirmed: false })).toMatch(/Confirm/);
    expect(validateCrmCampaignInput({ ...valid, cooldownSeconds: 2 })).toMatch(/30 seconds/);
    expect(validateCrmCampaignInput({ ...valid, contactIds: [] })).toMatch(/Select recipients/);
    expect(validateCrmCampaignInput({ ...valid, contactIds: [], sendAllMatching: true, matchingCount: 5001 })).toMatch(/5,000/);
    expect(validateCrmCampaignInput({ ...valid, contactIds: Array.from({ length: 5001 }, (_, index) => `contact-${index}`) })).toMatch(/5,000/);
  });
});
