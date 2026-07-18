import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { TURNSTILE_SITE_KEY, captchaEnabled } from '../lib/turnstile';

// Explicit-render build of the Turnstile script, loaded once and shared.
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let scriptPromise: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (typeof window !== 'undefined' && window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load the Turnstile script'));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export interface TurnstileHandle {
  reset: () => void;
}

interface TurnstileProps {
  onVerify: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
}

/**
 * Renders the Cloudflare Turnstile widget and reports the solved token. The token
 * is single-use, so callers reset the widget after each submit (see useCaptcha).
 */
export const Turnstile = forwardRef<TurnstileHandle, TurnstileProps>(function Turnstile(
  { onVerify, onExpire, onError },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useImperativeHandle(ref, () => ({
    reset() {
      if (widgetIdRef.current && window.turnstile) window.turnstile.reset(widgetIdRef.current);
    },
  }));

  useEffect(() => {
    if (!captchaEnabled) return;
    let cancelled = false;

    loadScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        if (widgetIdRef.current) return; // guard StrictMode double-invoke
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (token) => onVerify(token),
          'expired-callback': () => onExpire?.(),
          'error-callback': () => onError?.(),
          appearance: 'interaction-only', // stay invisible unless a challenge is needed
        });
      })
      .catch(() => onError?.());

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* widget already gone */
        }
        widgetIdRef.current = null;
      }
    };
    // Mount once; callbacks are read fresh each fire via closures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!captchaEnabled) return null;
  return <div ref={containerRef} className="flex justify-center" />;
});

export interface Captcha {
  /** Solved token, or '' when unsolved. Pass `token || undefined` to Supabase. */
  token: string;
  /** The widget to place in the form. */
  widget: ReactNode;
  /** Clear the consumed token and re-arm the widget (call after each attempt). */
  reset: () => void;
  /** True when captcha is off, or when a token has been solved. Gate submit on this. */
  ready: boolean;
}

/**
 * Wires a Turnstile widget to a form. Supabase enforces the token server-side
 * (it must match the secret in the dashboard); this hook just supplies it.
 */
export function useCaptcha(): Captcha {
  const ref = useRef<TurnstileHandle>(null);
  const [token, setToken] = useState('');

  const reset = () => {
    setToken('');
    ref.current?.reset();
  };

  const widget = captchaEnabled ? (
    <Turnstile
      ref={ref}
      onVerify={setToken}
      onExpire={() => setToken('')}
      onError={() => setToken('')}
    />
  ) : null;

  return { token, widget, reset, ready: !captchaEnabled || token.length > 0 };
}
