export interface CrmCampaignInput {
  name: string; subject: string; bodyText: string; bodyHtml: string | null; unresolvedTokens: string[]; provider: 'microsoft_graph' | 'brevo';
  cooldownSeconds: number; contactIds: string[]; industries: string[]; search: string;
  templateId?: string; consentConfirmed: boolean; sendAllMatching: boolean; matchingCount: number;
}

export function validateCrmCampaignInput(input: CrmCampaignInput): string | null {
  if (!input.name.trim()) return 'Campaign name is required.';
  if (!input.subject.trim()) return 'Subject is required.';
  if (!input.bodyText.trim() && !input.bodyHtml?.trim()) return 'Message body is required.';
  if (!input.bodyText.trim()) return 'Plain-text fallback is required for every campaign.';
  if (input.unresolvedTokens.length) return `Resolve personalization before queueing: ${input.unresolvedTokens.join(', ')}.`;
  if (!input.consentConfirmed) return 'Confirm that recipients expect this message.';
  if (!input.contactIds.length && (!input.sendAllMatching || input.matchingCount === 0)) return 'Select recipients or explicitly confirm sending to all matching contacts.';
  if (input.contactIds.length > 5000) return 'Select 5,000 recipients or fewer.';
  if (input.sendAllMatching && input.matchingCount > 5000) return 'Narrow the audience to 5,000 matching contacts or fewer.';
  if (!Number.isFinite(input.cooldownSeconds) || input.cooldownSeconds < 30) return 'Cooldown must be at least 30 seconds.';
  return null;
}
