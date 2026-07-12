import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { AuthShell } from './Login';
import { ErrorState, Spinner } from '../components/ui';

type State = 'working' | 'verified' | 'error';

/**
 * Landing page for links in Supabase auth emails (signup confirmation, magic
 * link, email change).
 *
 * There was no such route before: signUp() never passed `emailRedirectTo`, so
 * Supabase fell back to the project's Site URL — still the factory default
 * http://localhost:3000 — and the link opened a dead page even though the user
 * had in fact been created.
 *
 * Two link formats have to be handled:
 *   * implicit flow — tokens arrive in the URL hash. `detectSessionInUrl` is on,
 *     so supabase-js consumes them itself and we just wait for the session.
 *   * token_hash / OTP — newer templates send ?token_hash=…&type=signup, which
 *     has to be redeemed explicitly with verifyOtp().
 */
export function AuthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { session } = useAuth();
  const [state, setState] = useState<State>('working');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      // Supabase reports a bad/expired link with error params on the query string
      // or in the hash fragment.
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const errCode = params.get('error') ?? hash.get('error');
      const errDesc =
        params.get('error_description') ?? hash.get('error_description') ?? errCode;
      if (errCode) {
        if (!cancelled) {
          setError(decodeURIComponent(errDesc ?? 'This link is invalid or has expired.'));
          setState('error');
        }
        return;
      }

      const tokenHash = params.get('token_hash');
      const type = params.get('type');
      if (tokenHash) {
        const { error: otpErr } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: (type as 'signup' | 'email' | 'recovery' | 'invite') ?? 'signup',
        });
        if (cancelled) return;
        if (otpErr) {
          setError(otpErr.message);
          setState('error');
        } else {
          setState('verified');
        }
        return;
      }

      // Implicit flow: detectSessionInUrl consumes the hash tokens for us. Give
      // it a moment, then check whether a session actually materialised.
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        setState('verified');
        return;
      }

      // No tokens, no error — someone opened /auth/callback directly.
      setError('This confirmation link is missing its token. Request a new email and try again.');
      setState('error');
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [params]);

  // The implicit flow can settle slightly after our first getSession() check.
  useEffect(() => {
    if (session && state !== 'verified') setState('verified');
  }, [session, state]);

  if (state === 'working') {
    return (
      <AuthShell title="Confirming your email">
        <Spinner label="Verifying…" />
      </AuthShell>
    );
  }

  if (state === 'error') {
    return (
      <AuthShell title="Verification failed">
        <div className="space-y-3 text-sm">
          {error && <ErrorState error={error} />}
          <p className="text-slate-600">
            Verification links expire after a while and can only be used once. Create the
            account again, or sign in to have a new link sent.
          </p>
          <div className="flex gap-2 pt-1">
            <Link className="btn-secondary" to="/signup">
              Back to sign up
            </Link>
            <Link className="btn-primary" to="/login">
              Go to sign in
            </Link>
          </div>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Email verified">
      <div className="space-y-4 text-sm">
        <div
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-3xl text-emerald-700"
          aria-hidden
        >
          ✓
        </div>
        <p className="text-center text-slate-700">
          Your email address is confirmed and your account is active.
        </p>
        <button
          className="btn-primary w-full"
          onClick={() => navigate(session ? '/' : '/login?verified=1')}
        >
          {session ? 'Continue to dashboard' : 'Continue to sign in'}
        </button>
      </div>
    </AuthShell>
  );
}
