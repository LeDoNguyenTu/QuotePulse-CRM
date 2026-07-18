// Cloudflare Turnstile configuration.
//
// The SITE key is public by design — it is embedded in the page and rendered in
// the widget. The SECRET key is NOT here and must never be: it goes only into
// Supabase (Dashboard -> Authentication -> Attack Protection -> Enable Captcha ->
// Turnstile -> Captcha secret), where Supabase validates the token server-side.
//
// Override the site key per-environment with VITE_TURNSTILE_SITE_KEY; the default
// is the project's live widget so a plain commit works without extra config.
export const TURNSTILE_SITE_KEY: string =
  import.meta.env.VITE_TURNSTILE_SITE_KEY || '0x4AAAAAAD2tuz7YlYSIwNZe';

/** When false, the widget is skipped and auth calls send no token. */
export const captchaEnabled = TURNSTILE_SITE_KEY.length > 0;

// Minimal typing for the script Cloudflare injects onto window.
export interface TurnstileApi {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      callback: (token: string) => void;
      'expired-callback'?: () => void;
      'error-callback'?: () => void;
      theme?: 'light' | 'dark' | 'auto';
      appearance?: 'always' | 'execute' | 'interaction-only';
    }
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}
