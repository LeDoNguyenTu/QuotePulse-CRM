import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { prepareLoginEmailChange } from '../lib/accountEmail';
import { preparePasswordChange } from '../lib/accountPassword';
import { useIdleTimeout } from './useIdleTimeout';
import {
  DEFAULT_SESSION_TIMEOUT_MINUTES,
  normalizeSessionTimeoutMinutes,
  sessionTimeoutMs,
} from '../lib/sessionTimeout';

interface SignUpResult {
  /** false when Supabase requires the user to confirm their email first. */
  signedIn: boolean;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  /** True in the last minute before the idle timeout fires. */
  idleWarning: boolean;
  staySignedIn: () => void;
  applySessionTimeoutMinutes: (minutes: number) => void;
  // captchaToken is required whenever Supabase Attack Protection has Turnstile
  // enabled; it is ignored server-side when captcha is off.
  signIn: (email: string, password: string, captchaToken?: string) => Promise<void>;
  signUp: (email: string, password: string, captchaToken?: string) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
  changeLoginEmail: (email: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string, confirmation: string) => Promise<void>;
  resetPassword: (email: string, captchaToken?: string) => Promise<void>;
  resendVerification: (email: string, captchaToken?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/** Where Supabase should send the user after they click a link in an email. */
export function authCallbackUrl(flow?: 'email-change'): string {
  const url = new URL('/auth/callback', window.location.origin);
  if (flow) url.searchParams.set('flow', flow);
  return url.toString();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();
  const previousUserId = useRef<string | null | undefined>(undefined);
  const [runtimeTimeout, setRuntimeTimeout] = useState<{
    userId: string;
    minutes: number;
  } | null>(null);

  useEffect(() => {
    const applySession = (nextSession: Session | null) => {
      const nextUserId = nextSession?.user.id ?? null;
      if (previousUserId.current !== undefined && previousUserId.current !== nextUserId) {
        void queryClient.cancelQueries();
        queryClient.clear();
      }
      previousUserId.current = nextUserId;
      setSession(nextSession);
    };

    supabase.auth.getSession().then(({ data }) => {
      applySession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      applySession(newSession);
    });
    return () => sub.subscription.unsubscribe();
  }, [queryClient]);

  const handleIdleTimeout = useCallback(async () => {
    await supabase.auth.signOut();
    // Full navigation so every cached query is dropped along with the session.
    window.location.assign('/login?reason=timeout');
  }, []);

  const sessionUserId = session?.user.id ?? null;
  const { data: storedTimeoutMinutes = DEFAULT_SESSION_TIMEOUT_MINUTES } = useQuery({
    queryKey: ['session-timeout', sessionUserId],
    enabled: !!sessionUserId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_settings')
        .select('session_timeout_minutes')
        .eq('user_id', sessionUserId!)
        .maybeSingle();
      if (error) throw error;
      return normalizeSessionTimeoutMinutes(data?.session_timeout_minutes);
    },
  });
  const activeTimeoutMinutes =
    runtimeTimeout?.userId === sessionUserId
      ? runtimeTimeout.minutes
      : storedTimeoutMinutes;
  const activeTimeoutMs = sessionTimeoutMs(activeTimeoutMinutes);

  const { warning, staySignedIn } = useIdleTimeout({
    enabled: !!session && activeTimeoutMs !== null,
    timeoutMs: activeTimeoutMs ?? DEFAULT_SESSION_TIMEOUT_MINUTES * 60 * 1000,
    onTimeout: handleIdleTimeout,
  });

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      idleWarning: warning,
      staySignedIn,
      applySessionTimeoutMinutes(minutes) {
        if (!sessionUserId) return;
        setRuntimeTimeout({
          userId: sessionUserId,
          minutes: normalizeSessionTimeoutMinutes(minutes),
        });
      },
      async signIn(email, password, captchaToken) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
          options: { captchaToken },
        });
        if (error) throw error;
      },
      async signUp(email, password, captchaToken) {
        // Without emailRedirectTo, Supabase falls back to the project's Site URL,
        // which defaults to http://localhost:3000 — that is why the confirmation
        // link opened a dead page. Note the Site URL / redirect allow-list still
        // has to permit this origin (Supabase dashboard -> Auth -> URL config).
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: authCallbackUrl(), captchaToken },
        });
        if (error) throw error;
        return { signedIn: !!data.session };
      },
      async signOut() {
        await queryClient.cancelQueries();
        queryClient.clear();
        await supabase.auth.signOut();
      },
      async changeLoginEmail(email) {
        const prepared = prepareLoginEmailChange(session?.user.email, email);
        if ('error' in prepared) throw new Error(prepared.error);

        // This updates auth.users.email for the current user only. It does not
        // create a user or change auth.users.id, so all owner_id / created_by
        // relationships in the application stay attached to this same account.
        const { error } = await supabase.auth.updateUser(
          { email: prepared.email },
          { emailRedirectTo: authCallbackUrl('email-change') }
        );
        if (error) throw error;
      },
      async changePassword(currentPassword, newPassword, confirmation) {
        const prepared = preparePasswordChange(currentPassword, newPassword, confirmation);
        if ('error' in prepared) throw new Error(prepared.error);

        const { error } = await supabase.auth.updateUser({
          current_password: prepared.currentPassword,
          password: prepared.newPassword,
        });
        if (error) throw error;
      },
      async resetPassword(email, captchaToken) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/login`,
          captchaToken,
        });
        if (error) throw error;
      },
      async resendVerification(email, captchaToken) {
        const { error } = await supabase.auth.resend({
          type: 'signup',
          email,
          options: { emailRedirectTo: authCallbackUrl(), captchaToken },
        });
        if (error) throw error;
      },
    }),
    [session, sessionUserId, loading, warning, staySignedIn, queryClient]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
