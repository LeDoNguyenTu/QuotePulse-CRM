import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ContactEmailHistory } from './ContactEmailHistory';

describe('ContactEmailHistory', () => {
  it('shows delivery state and the exact stored message in a sandbox', () => {
    const html = renderToStaticMarkup(<ContactEmailHistory rows={[{
      id: 'send-1', workspace_id: 'workspace-1', campaign_id: 'campaign-1', campaign_name: 'Testing campaign',
      contact_id: 'contact-1', company_id: 'company-1', to_email: 'person@example.com', subject: 'Exact subject',
      body_rendered: 'Exact fallback', body_html_rendered: '<table><tr><td>Exact HTML</td></tr></table>', status: 'failed',
      provider: 'brevo', provider_message_id: null, attempt_count: 1, scheduled_at: '2026-10-11T00:00:00Z',
      next_attempt_at: null, sent_at: null, error_message: 'Rejected', last_error_code: '401', retry_of_id: null,
      is_current_attempt: false, attempted_at: '2026-10-11T00:00:30Z', failed_at: '2026-10-11T00:01:00Z', blocked_at: null,
      created_at: '2026-10-11T00:00:00Z', updated_at: '2026-10-11T00:01:00Z',
    }]} onRetry={vi.fn()} retryingId={null} />);

    expect(html).toContain('Email history');
    expect(html).toContain('Testing campaign');
    expect(html).toContain('failed');
    expect(html).toContain('Exact subject');
    expect(html).toContain('sandbox=""');
    expect(html).toContain('Exact HTML');
    expect(html).toContain('Attempted');
    expect(html).toContain('Failed');
    expect(html).not.toContain('Retry failed send');
  });
});
