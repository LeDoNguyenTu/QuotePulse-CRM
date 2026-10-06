import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ErrorState, Spinner } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { prepareRecoveredPassword } from '../lib/accountPassword';
import { supabase } from '../lib/supabase';
import { AuthShell } from './Login';

function recoveryLinkError(params: URLSearchParams): string | null {
  const hashValue = typeof window === 'undefined' ? '' : window.location.hash;
  const hash = new URLSearchParams(hashValue.replace(/^#/, ''));
  const code = params.get('error') ?? hash.get('error');
  if (!code) return null;
  const description = params.get('error_description') ?? hash.get('error_description');
  return decodeURIComponent(description ?? 'This reset link is invalid or has expired.');
}

export function PasswordReset() {
  const { session, loading, completePasswordReset } = useAuth();
  const [params] = useSearchParams();
  const hasLinkPayload = !!params.get('token_hash') || (typeof window !== 'undefined' && window.location.hash.includes('access_token='));
  const initialError = useMemo(() => recoveryLinkError(params), [params]);
  const [resolving, setResolving] = useState(hasLinkPayload && !initialError && !session);
  const [recoveryReady, setRecoveryReady] = useState(!!session && hasLinkPayload);
  const [linkError, setLinkError] = useState<string | null>(initialError);
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    if (session && hasLinkPayload) setRecoveryReady(true);
  }, [hasLinkPayload, session]);

  useEffect(() => {
    let cancelled = false;
    async function resolveRecoverySession() {
      if (initialError || session || !hasLinkPayload) {
        setResolving(false);
        return;
      }
      const tokenHash = params.get('token_hash');
      if (tokenHash) {
        const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
        if (cancelled) return;
        if (error) setLinkError(error.message);
        else setRecoveryReady(!!data.session);
        setResolving(false);
        return;
      }
      const { data, error } = await supabase.auth.getSession();
      if (cancelled) return;
      if (error) setLinkError(error.message);
      else setRecoveryReady(!!data.session);
      setResolving(false);
    }
    void resolveRecoverySession();
    return () => { cancelled = true; };
  }, [hasLinkPayload, initialError, params, session]);

  const validation = prepareRecoveredPassword(newPassword, confirmation);
  const inlineError = confirmation && 'error' in validation ? validation.error : null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if ('error' in validation) {
      setSubmitError(validation.error);
      return;
    }
    setBusy(true);
    setSubmitError(null);
    try {
      await completePasswordReset(validation.newPassword, confirmation);
      setComplete(true);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  if (complete) {
    return <AuthShell title="Password changed"><div className="space-y-4 text-sm"><p className="text-emerald-700">Your password was changed successfully.</p><Link className="btn-primary block w-full text-center" to="/login?password_reset=1">Continue to sign in</Link></div></AuthShell>;
  }
  if (loading || resolving) return <AuthShell title="Checking reset link"><Spinner label="Verifying…" /></AuthShell>;
  if (linkError || !recoveryReady) {
    return <AuthShell title="Reset link expired or invalid"><div className="space-y-4 text-sm">{linkError&&<ErrorState error={linkError}/>}<p className="text-slate-600">Request a new password reset email. Reset links expire and can only be used once.</p><Link className="btn-primary block w-full text-center" to="/forgot-password">Request a new reset link</Link></div></AuthShell>;
  }
  return (
    <AuthShell title="Choose a new password">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div><label className="label">New password</label><input className="input" type="password" autoComplete="new-password" value={newPassword} onChange={(event)=>setNewPassword(event.target.value)} required /></div>
        <div><label className="label">Confirm new password</label><input className="input" type="password" autoComplete="new-password" value={confirmation} onChange={(event)=>setConfirmation(event.target.value)} required /></div>
        {inlineError&&<p className="text-sm text-red-700" role="alert">{inlineError}</p>}
        {submitError&&<ErrorState error={submitError}/>}<button className="btn-primary w-full" disabled={busy||'error' in validation}>{busy?'Changing password…':'Change password'}</button>
      </form>
    </AuthShell>
  );
}
