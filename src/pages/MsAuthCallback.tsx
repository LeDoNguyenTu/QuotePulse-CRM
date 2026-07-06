import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { functions } from '../lib/functions';
import { ErrorState, Spinner } from '../components/ui';

/**
 * Landing route for the Microsoft OAuth redirect. Microsoft appends ?code=...
 * We forward the code to the ms-auth-callback Edge Function, which exchanges it
 * (using the confidential client secret) and stores the refresh token.
 */
export function MsAuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // guard StrictMode double-invoke
    ran.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    // ms-auth-start stamps the signed-in user id into `state`; forward it so the
    // callback can identify the user even if this page loaded on a different
    // origin than the login (Vercel serves the app on several domains).
    const state = params.get('state') ?? undefined;
    const oauthError = params.get('error_description') || params.get('error');

    if (oauthError) {
      setError(oauthError);
      return;
    }
    if (!code) {
      setError('No authorization code returned by Microsoft.');
      return;
    }

    const redirectUri = import.meta.env.VITE_MS_REDIRECT_URI as string;
    functions
      .msAuthCallback(code, redirectUri, state)
      .then(() => {
        setDone(true);
        setTimeout(() => navigate('/settings'), 1200);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-sm space-y-3 p-6 text-center">
        <h1 className="text-lg font-semibold">Connecting Microsoft…</h1>
        {error ? (
          <ErrorState error={error} />
        ) : done ? (
          <p className="text-sm text-emerald-700">Connected. Redirecting…</p>
        ) : (
          <Spinner label="Exchanging authorization code…" />
        )}
      </div>
    </div>
  );
}
