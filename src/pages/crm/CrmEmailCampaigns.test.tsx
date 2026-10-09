import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CrmEmailCampaigns } from './CrmEmailCampaigns';

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
    campaigns: { data: [], isLoading: false, error: null },
    resolveMatchingRecipientIds: { isPending: false, mutateAsync: vi.fn() },
    queue: { isPending: false, mutateAsync: vi.fn() },
  }),
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

vi.mock('../../hooks/useUnsavedChanges', () => ({ useUnsavedChanges: vi.fn() }));

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
});
