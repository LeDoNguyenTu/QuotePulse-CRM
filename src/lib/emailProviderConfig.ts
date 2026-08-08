import type { EmailProvider } from './types';

export interface EmailProviderSettings {
  ms_refresh_token?: string | null;
  brevo_api_key?: string | null;
  brevo_sender_email?: string | null;
}

/** Explain the missing customer-owned configuration for the selected sender. */
export function emailProviderConfigurationError(
  provider: EmailProvider,
  settings: EmailProviderSettings
): string | null {
  if (provider === 'brevo') {
    if (!settings.brevo_api_key?.trim()) return 'Enter your Brevo API key in Settings.';
    if (!settings.brevo_sender_email?.trim()) {
      return 'Enter a verified Brevo sender email in Settings.';
    }
    return null;
  }

  return settings.ms_refresh_token?.trim()
    ? null
    : 'Connect your Microsoft 365 mailbox in Settings first.';
}
