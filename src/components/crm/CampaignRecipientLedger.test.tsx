import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { CrmCampaignRecipientReport } from '../../lib/crm/types';
import { CampaignRecipientLedger } from './CampaignRecipientLedger';

const base: CrmCampaignRecipientReport = {
  id: 'recipient-1', workspace_id: 'workspace-1', campaign_id: 'campaign-1', contact_id: 'contact-1', company_id: 'company-1',
  email_normalized: 'person@example.com', contact_name: 'Test Person', company_name: 'Example Co', industry: null,
  recipient_status: 'sent', status: 'failed', blocked_reason: null, email_send_id: 'send-2', campaign_name: 'Campaign',
  attempt_id: 'send-1', is_current_attempt: false, subject: 'Subject', body_rendered: 'Body', body_html_rendered: null,
  provider: 'brevo', provider_message_id: null, attempt_count: 1, scheduled_at: '2026-10-11T00:00:00Z',
  next_attempt_at: null, attempted_at: '2026-10-11T00:01:00Z', sent_at: null, failed_at: '2026-10-11T00:02:00Z', blocked_at: null,
  error_message: 'Rejected', last_error_code: '400', retry_of_id: null, send_created_at: '2026-10-11T00:00:00Z', send_updated_at: '2026-10-11T00:02:00Z',
};

describe('CampaignRecipientLedger', () => {
  it('keeps historical attempt status and offers retry only on the current attempt', () => {
    const html = renderToStaticMarkup(<CampaignRecipientLedger rows={[
      base,
      { ...base, attempt_id: 'send-2', email_send_id: 'send-2', is_current_attempt: true, status: 'sent', provider_message_id: 'provider-1', error_message: null, last_error_code: null, retry_of_id: 'send-1', attempted_at: '2026-10-11T00:03:00Z', failed_at: null, sent_at: '2026-10-11T00:04:00Z' },
    ]} loading={false} error={null} onRetry={vi.fn()} retryingId={null} />);

    expect(html).toContain('crm-status--failed');
    expect(html).toContain('crm-status--sent');
    expect(html).toContain('Attempted');
    expect(html).toContain('Failed');
    expect(html).toContain('Sent');
    expect(html).not.toContain('Retry failed send');
  });
});
