import { describe, expect, it } from 'vitest';
import { campaignOutcomeLabel, classifyDeliveryFailure } from './emailDelivery';

describe('email delivery presentation', () => {
  it('labels a terminal campaign with failed recipients as completed with failures', () => {
    expect(campaignOutcomeLabel({ status: 'completed', failed_count: 1, blocked_count: 0 } as never))
      .toBe('Completed with failures');
  });

  it('explains Brevo unrecognised IP failures and permits only definitive retries', () => {
    const result = classifyDeliveryFailure({
      status: 'failed', provider_message_id: null, last_error_code: '401',
      error_message: 'Brevo detected an unrecognised IP address 2406:da18::1.',
    });
    expect(result.summary).toContain('Brevo blocked the sending server IP');
    expect(result.retryable).toBe(true);
    expect(classifyDeliveryFailure({ ...result, status: 'blocked', provider_message_id: null }).retryable).toBe(false);
    expect(classifyDeliveryFailure({ ...result, status: 'failed', provider_message_id: 'accepted-1' }).retryable).toBe(false);
  });
});
