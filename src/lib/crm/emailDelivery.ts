import type { CrmEmailCampaign } from './types';

export function campaignOutcomeLabel(campaign: Pick<CrmEmailCampaign, 'status' | 'failed_count' | 'blocked_count'>): string {
  if (campaign.status === 'completed' && campaign.failed_count + campaign.blocked_count > 0) return 'Completed with failures';
  return campaign.status.replace(/_/g, ' ').replace(/^./, (letter: string) => letter.toUpperCase());
}

function readableProviderError(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { message?: unknown };
    if (parsed && typeof parsed === 'object' && typeof parsed.message === 'string' && parsed.message.trim()) {
      return parsed.message.trim();
    }
  } catch {
    // Providers may return plain text; preserve it as-is.
  }
  return raw;
}

export function classifyDeliveryFailure(row: {
  status: string;
  provider_message_id?: string | null;
  last_error_code?: string | null;
  error_message?: string | null;
}): { summary: string; retryable: boolean } {
  const raw = row.error_message?.trim() || 'No provider error was recorded.';
  const readable = readableProviderError(raw);
  const summary = /(?:unrecognised|unrecognized)[\s-]*ip/i.test(readable)
    ? 'Brevo blocked the sending server IP. Check Brevo API-key IP restrictions, then retry this definitive failure.'
    : readable;
  return { summary, retryable: row.status === 'failed' && !row.provider_message_id };
}
