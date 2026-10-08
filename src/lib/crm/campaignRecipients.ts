export interface CampaignRecipient {
  contact_id: string;
  company_id: string | null;
  contact_name: string | null;
  email_normalized: string;
  company_name: string | null;
  industry: string | null;
}

export const CAMPAIGN_RECIPIENT_LIMIT = 5000;

function normalizedEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function addRecipients(
  current: CampaignRecipient[],
  additions: CampaignRecipient[],
): CampaignRecipient[] {
  const byEmail = new Map(current.map((item) => [normalizedEmail(item.email_normalized), item]));
  for (const item of additions) {
    const email = normalizedEmail(item.email_normalized);
    if (!byEmail.has(email)) byEmail.set(email, item);
  }
  if (byEmail.size > CAMPAIGN_RECIPIENT_LIMIT) {
    throw new Error('Campaigns are limited to 5,000 selected recipients.');
  }
  return [...byEmail.values()];
}

export function removeRecipient(current: CampaignRecipient[], contactId: string): CampaignRecipient[] {
  return current.filter((item) => item.contact_id !== contactId);
}

export function clearRecipients(_current: CampaignRecipient[]): CampaignRecipient[] {
  return [];
}

export async function collectRecipientPages(
  fetchPage: (from: number, to: number) => Promise<CampaignRecipient[]>,
  pageSize = 1000,
): Promise<CampaignRecipient[]> {
  let result: CampaignRecipient[] = [];
  for (let from = 0; from < CAMPAIGN_RECIPIENT_LIMIT; from += pageSize) {
    const page = await fetchPage(from, Math.min(from + pageSize - 1, CAMPAIGN_RECIPIENT_LIMIT - 1));
    result = addRecipients(result, page);
    if (page.length < pageSize) return result;
  }
  return result;
}
