import { useEffect, useRef, useState } from 'react';

/** Sign out after this long with no user activity. */
export const IDLE_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours
/** Show the "you're about to be signed out" warning this long before the cut-off. */
export const IDLE_WARNING_MS = 60 * 1000; // 1 minute

const ACTIVITY_EVENTS = [
  'mousemove',
  'mousedown',
  'keydown',
  'scroll',
  'touchstart',
  'click',
] as const;

/** Don't reset the timer more than once a second — mousemove fires constantly. */
const THROTTLE_MS = 1000;

interface Options {
  /** Only run the timer while someone is actually signed in. */
  enabled: boolean;
  onTimeout: () => void;
}

/**
 * Idle timeout for the auth session.
 *
 * Supabase keeps refreshing the access token forever, so without this a login
 * never expires. This watches for real user activity and signs the user out
 * after IDLE_TIMEOUT_MS, warning them shortly beforehand so they can stay in.
 *
 * `visibilitychange` counts as activity when the tab becomes visible again:
 * coming back to the tab is a deliberate act, and it also re-checks the deadline
 * for a machine that was asleep.
 */
export function useIdleTimeout({ enabled, onTimeout }: Options) {
  const [warning, setWarning] = useState(false);
  const deadlineRef = useRef<number>(Date.now() + IDLE_TIMEOUT_MS);
  const lastResetRef = useRef(0);
  // Keep the latest callback without restarting the interval each render.
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  useEffect(() => {
    if (!enabled) {
      setWarning(false);
      return;
    }

    const reset = () => {
      const now = Date.now();
      if (now - lastResetRef.current < THROTTLE_MS) return;
      lastResetRef.current = now;
      deadlineRef.current = now + IDLE_TIMEOUT_MS;
      setWarning(false);
    };

    // Start fresh whenever the timer is (re)enabled, e.g. right after sign-in.
    deadlineRef.current = Date.now() + IDLE_TIMEOUT_MS;
    setWarning(false);

    for (const evt of ACTIVITY_EVENTS) {
      window.addEventListener(evt, reset, { passive: true });
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') reset();
    };
    document.addEventListener('visibilitychange', onVisible);

    const tick = window.setInterval(() => {
      const remaining = deadlineRef.current - Date.now();
      if (remaining <= 0) {
        onTimeoutRef.current();
      } else {
        setWarning(remaining <= IDLE_WARNING_MS);
      }
    }, 5000);

    return () => {
      for (const evt of ACTIVITY_EVENTS) window.removeEventListener(evt, reset);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(tick);
    };
  }, [enabled]);

  /** Called by the warning banner's "Stay signed in" button. */
  const staySignedIn = () => {
    deadlineRef.current = Date.now() + IDLE_TIMEOUT_MS;
    lastResetRef.current = Date.now();
    setWarning(false);
  };

  return { warning, staySignedIn };
}
