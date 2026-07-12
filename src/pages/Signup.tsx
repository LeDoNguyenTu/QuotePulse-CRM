import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { ErrorState } from '../components/ui';
import { AuthShell } from './Login';

export function Signup() {
  const { signUp, resendVerification } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resent, setResent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { signedIn } = await signUp(email, password);
      if (signedIn) {
        // Email confirmation is disabled on this project — straight in.
        navigate('/');
      } else {
        // Confirmation required. Previously this navigated to "/" anyway, which
        // just bounced back to /login and looked broken.
        setNeedsVerification(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleResend() {
    setError(null);
    setResent(false);
    try {
      await resendVerification(email);
      setResent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (needsVerification) {
    return (
      <AuthShell title="Check your inbox">
        <div className="space-y-3 text-sm">
          <div className="text-4xl" aria-hidden>
            ✉️
          </div>
          <p className="text-slate-700">
            We sent a verification link to <b className="break-all">{email}</b>. Click it to
            activate your account, then sign in.
          </p>
          <p className="text-slate-500">
            No email after a minute or two? Check your spam folder, or resend it.
          </p>
          {error && <ErrorState error={error} />}
          {resent && <p className="text-emerald-700">Verification email resent.</p>}
          <div className="flex gap-2 pt-1">
            <button className="btn-secondary" onClick={handleResend}>
              Resend email
            </button>
            <Link className="btn-primary" to="/login">
              Go to sign in
            </Link>
          </div>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Create account">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Email</label>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label">Password (min 6 chars)</label>
          <input
            className="input"
            type="password"
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <ErrorState error={error} />}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? 'Creating…' : 'Create account'}
        </button>
      </form>
      <div className="mt-4 text-sm">
        <Link className="text-brand-600 hover:underline" to="/login">
          Already have an account? Sign in
        </Link>
      </div>
    </AuthShell>
  );
}
