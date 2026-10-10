import type { CrmEmailCampaign } from './types';

export function campaignOutcomeLabel(campaign: Pick<CrmEmailCampaign, 'status' | 'failed_count' | 'blocked_count'>): string {
  if (campaign.status === 'completed' && campaign.failed_count + campaign.blocked_count > 0) return 'Completed with failures';
  return campaign.status.replace(/_/g, ' ').replace(/^./, (letter: string) => letter.toUpperCase());
}

export function classifyDeliveryFailure(row: {
  status: string;
  provider_message_id?: string | null;
  last_error_code?: string | null;
  error_message?: string | null;
}): { summary: string; retryable: boolean } {
  const raw = row.error_message?.trim() || 'No provider error was recorded.';
  const summary = /brevo[\s\S]*(?:unrecognised|unrecognized)[\s-]*ip/i.test(raw)
    ? 'Brevo blocked the sending server IP. Check Brevo API-key IP restrictions, then retry this definitive failure.'
    : raw;
  return { summary, retryable: row.status === 'failed' && !row.provider_message_id };
}
