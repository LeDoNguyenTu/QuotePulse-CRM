import { describe, expect, it } from 'vitest';
import { hubspotFilePreviewUrl, hubspotRecordUrl } from './hubspotLinks';

describe('HubSpot navigation URLs', () => {
  it('creates a durable file preview URL', () => {
    expect(hubspotFilePreviewUrl('6561878', 'app.hubspot.com', '213209249324'))
      .toBe('https://app.hubspot.com/file-preview/6561878/file/213209249324/');
  });

  it('links to the matching company record in HubSpot', () => {
    expect(hubspotRecordUrl('6561878', 'app.hubspot.com', 'company', '123'))
      .toBe('https://app.hubspot.com/contacts/6561878/record/0-2/123');
  });
});
