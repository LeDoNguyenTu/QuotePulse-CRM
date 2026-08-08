import { describe, expect, it } from 'vitest';
import { emailProviderConfigurationError } from './emailProviderConfig';

describe('emailProviderConfigurationError', () => {
  it('requires a customer-owned Brevo API key and verified sender', () => {
    expect(
      emailProviderConfigurationError('brevo', {
        brevo_api_key: null,
        brevo_sender_email: 'sales@example.com',
      })
    ).toBe('Enter your Brevo API key in Settings.');
    expect(
      emailProviderConfigurationError('brevo', {
        brevo_api_key: 'xkeysib-example',
        brevo_sender_email: null,
      })
    ).toBe('Enter a verified Brevo sender email in Settings.');
  });

  it('requires a connected mailbox only for Microsoft Graph', () => {
    expect(
      emailProviderConfigurationError('microsoft_graph', { ms_refresh_token: null })
    ).toBe('Connect your Microsoft 365 mailbox in Settings first.');
    expect(
      emailProviderConfigurationError('brevo', {
        brevo_api_key: 'xkeysib-example',
        brevo_sender_email: 'sales@example.com',
      })
    ).toBeNull();
  });
});
