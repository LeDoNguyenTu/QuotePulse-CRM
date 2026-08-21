import { useLocation, useNavigate } from 'react-router-dom';
import { safeReturnTarget, type ReturnNavigationState } from '../lib/returnNavigation';

export function HistoryBackLink({ fallback, children }: { fallback: string; children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as ReturnNavigationState | null;
  const target = safeReturnTarget(state, fallback);
  const hasPriorRoute = location.key !== 'default' || target !== fallback || state?.from === fallback;

  return (
    <button
      type="button"
      className="text-sm text-brand-600 hover:underline"
      onClick={() => hasPriorRoute ? navigate(-1) : navigate(fallback, { replace: true })}
    >
      {children}
    </button>
  );
}
