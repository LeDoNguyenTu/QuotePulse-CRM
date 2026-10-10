import { renderToStaticMarkup } from 'react-dom/server';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { CrmEmailCampaigns } from './CrmEmailCampaigns';

const useUnsavedChangesMock = vi.hoisted(() => vi.fn());

vi.mock('../../hooks/useWorkspaces', () => ({
  useActiveWorkspace: () => ({ id: 'sales-id', name: 'Sales CRM', kind: 'sales_crm', role: 'owner' }),
}));

vi.mock('../../hooks/crm/useCrmCampaigns', () => ({
  useCrmCampaigns: () => ({
    contacts: {
      data: {
        count: 1,
        rows: [{ contact_id: 'contact-1', contact_name: 'Avery Tan', email_normalized: 'avery@example.com', company_name: 'Northstar' }],
      },
      isLoading: false,
      isFetching: true,
      error: null,
    },
    campaigns: { data: [{ id: 'campaign-1', name: 'Testing campaign', status: 'completed', provider: 'brevo', recipient_count: 1, queued_count: 0, scheduled_count: 0, sending_count: 0, retrying_count: 0, sent_count: 0, deferred_count: 0, blocked_count: 0, failed_count: 1 }], isLoading: false, error: null },
    resolveMatchingRecipientIds: { isPending: false, mutateAsync: vi.fn() },
    queue: { isPending: false, mutateAsync: vi.fn() },
  }),
  useCampaignRecipients: () => ({ data: [{ id: 'recipient-1', campaign_id: 'campaign-1', email_normalized: 'test@example.com', contact_name: 'Test Person', company_name: 'Northstar', status: 'failed', provider: 'brevo', provider_message_id: null, attempt_count: 1, error_message: 'Brevo detected an unrecognised IP address.', last_error_code: '401', subject: 'Exact subject', body_rendered: 'Exact text', body_html_rendered: '<p>Exact HTML</p>', email_send_id: 'send-1', attempt_id: 'send-1', is_current_attempt: true }], isLoading: false, error: null }),
  useRetryFailedEmail: () => ({ isPending: false, variables: null, mutateAsync: vi.fn() }),
}));

vi.mock('../../hooks/useTemplates', () => ({
  useTemplates: () => ({ data: [{ id: 'template-1', name: 'Introduction', subject: 'Hello', body: 'Welcome' }] }),
}));

vi.mock('../../hooks/useSettings', () => ({
  useSettings: () => ({ data: { email_provider: 'brevo' } }),
}));

vi.mock('../../hooks/crm/useCrmCompanies', () => ({
  useCrmIndustryOptions: () => ({ data: ['Technology'] }),
}));

vi.mock('../../hooks/useUnsavedChanges', () => ({ useUnsavedChanges: useUnsavedChangesMock }));

describe('CRM email campaign composer', () => {
  it('separates message editing from audience and delivery controls', () => {
    const html = renderToStaticMarkup(<CrmEmailCampaigns />);

    expect(html).toContain('crm-campaign-layout');
    expect(html).toContain('Message content');
    expect(html).toContain('Audience &amp; delivery');
    expect(html).toContain('Avery Tan');
    expect(html).not.toMatch(/>0[123]</);
  });

  it('presents the queue action as a clear recipient-aware primary action', () => {
    const html = renderToStaticMarkup(<CrmEmailCampaigns />);

    expect(html).toContain('crm-primary-action');
    expect(html).toContain('Select recipients to continue');
    expect(html).toContain('Recipients expect this message');
    expect(html).toContain('aria-live="polite"');
  });

  it('uses the saved delivery provider as the campaign default', () => {
    const html = renderToStaticMarkup(<CrmEmailCampaigns />);

    expect(html).toContain('<option value="brevo" selected="">Brevo</option>');
  });

  it('keeps the audience visible while refreshed results are loading', () => {
    const html = renderToStaticMarkup(<CrmEmailCampaigns />);

    expect(html).toContain('Updating audience');
    expect(html).toContain('Avery Tan');
  });

  it('marks the campaign dirty when message metadata is edited', () => {
    let renderer: ReturnType<typeof create>;
    act(() => { renderer = create(<CrmEmailCampaigns />); });
    const name = renderer!.root.findAllByType('input').find((input) => input.props.placeholder === 'September renewal outreach')!;

    act(() => name.props.onChange({ target: { value: 'October renewal outreach' } }));

    expect(useUnsavedChangesMock).toHaveBeenLastCalledWith(expect.objectContaining({ dirty: true }));
  });

  it('expands completed campaigns into a recipient delivery ledger', () => {
    let renderer: ReturnType<typeof create>;
    act(() => { renderer = create(<CrmEmailCampaigns />); });
    expect(JSON.stringify(renderer!.toJSON())).toContain('Completed with failures');
    const campaign = renderer!.root.findAllByType('button').find((button) => button.props['aria-label'] === 'View Testing campaign delivery details')!;
    act(() => campaign.props.onClick());
    const html = renderer!.toJSON();
    expect(JSON.stringify(html)).toContain('test@example.com');
    expect(JSON.stringify(html)).toContain('Brevo blocked the sending server IP');
    expect(JSON.stringify(html)).toContain('Exact HTML');
  });
});
