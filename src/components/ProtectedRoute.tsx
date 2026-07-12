import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Spinner } from './ui';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading, idleWarning, staySignedIn } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Loading…" />
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;

  // A stored session can outlive its access token (e.g. the machine slept through
  // the refresh window). Treat an already-expired session as signed out rather
  // than rendering the app and letting every query fail with a 401.
  const expiresAt = session.expires_at; // seconds since epoch
  if (expiresAt && expiresAt * 1000 <= Date.now()) {
    return <Navigate to="/login?reason=expired" replace />;
  }

  return (
    <>
      {idleWarning && <IdleWarningBanner onStay={staySignedIn} />}
      {children}
    </>
  );
}

function IdleWarningBanner({ onStay }: { onStay: () => void }) {
  return (
    <div className="sticky top-0 z-50 flex flex-wrap items-center gap-3 border-b border-amber-300 bg-amber-100 px-4 py-2 text-sm text-amber-900">
      <span>You&apos;ll be signed out shortly because of inactivity.</span>
      <button
        className="rounded-md bg-amber-800 px-3 py-1 text-xs font-medium text-white hover:bg-amber-900"
        onClick={onStay}
      >
        Stay signed in
      </button>
    </div>
  );
}
