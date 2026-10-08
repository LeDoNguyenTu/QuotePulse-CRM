import { describe, expect, it } from 'vitest';
import { renderCampaignPreview } from './emailCampaignPreview';

describe('renderCampaignPreview', () => {
  it('personalizes subject, html, and text for the selected recipient', () => {
    expect(renderCampaignPreview({
      subject: 'Hello {{contact_name}}',
      bodyHtml: '<strong>{{company_name}}</strong>',
      bodyText: '{{industry}} update for {{contact_name}}',
    }, {
      contact_name: 'Avery Tan', company_name: 'Northstar', industry: 'Technology',
    })).toEqual({
      subject: 'Hello Avery Tan',
      bodyHtml: '<strong>Northstar</strong>',
      bodyText: 'Technology update for Avery Tan',
      unresolvedTokens: [],
    });
  });

  it('reports unresolved supported and unknown tokens', () => {
    const preview = renderCampaignPreview({
      subject: 'Hello {{contact_name}}', bodyHtml: null, bodyText: '{{missing}} / {{company_name}}',
    }, { contact_name: null, company_name: 'Northstar', industry: null });
    expect(preview.unresolvedTokens).toEqual(['contact_name', 'missing']);
  });
});
