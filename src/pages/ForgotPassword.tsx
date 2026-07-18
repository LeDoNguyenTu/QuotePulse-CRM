import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useCaptcha } from '../components/Turnstile';
import { ErrorState } from '../components/ui';
import { AuthShell } from './Login';

export function ForgotPassword() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const captcha = useCaptcha();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await resetPassword(email, captcha.token || undefined);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      captcha.reset();
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Reset password">
      {sent ? (
        <p className="text-sm text-emerald-700">
          If an account exists for {email}, a reset link has been sent.
        </p>
      ) : (
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
          {error && <ErrorState error={error} />}
          {captcha.widget}
          <button className="btn-primary w-full" disabled={busy || !captcha.ready}>
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}
      <div className="mt-4 text-sm">
        <Link className="text-brand-600 hover:underline" to="/login">
          Back to sign in
        </Link>
      </div>
    </AuthShell>
  );
}
