export interface CrmCampaignInput {
  name: string; subject: string; body: string; provider: 'microsoft_graph' | 'brevo';
  cooldownSeconds: number; contactIds: string[]; industries: string[]; search: string;
  templateId?: string; consentConfirmed: boolean; sendAllMatching: boolean; matchingCount: number;
}

export function validateCrmCampaignInput(input: CrmCampaignInput): string | null {
  if (!input.name.trim()) return 'Campaign name is required.';
  if (!input.subject.trim()) return 'Subject is required.';
  if (!input.body.trim()) return 'Message body is required.';
  if (!input.consentConfirmed) return 'Confirm that recipients expect this message.';
  if (!input.contactIds.length && (!input.sendAllMatching || input.matchingCount === 0)) return 'Select recipients or explicitly confirm sending to all matching contacts.';
  if (input.sendAllMatching && input.matchingCount > 5000) return 'Narrow the audience to 5,000 matching contacts or fewer.';
  if (!Number.isFinite(input.cooldownSeconds) || input.cooldownSeconds < 30) return 'Cooldown must be at least 30 seconds.';
  return null;
}
