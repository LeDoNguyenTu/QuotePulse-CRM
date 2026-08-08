const AUTH_OTP_TYPES = new Set(['signup', 'email', 'email_change', 'recovery', 'invite']);

/** Return a Supabase email OTP type accepted by this callback. */
export function authOtpType(type: string | null): 'signup' | 'email' | 'email_change' | 'recovery' | 'invite' {
  if (type && AUTH_OTP_TYPES.has(type)) {
    return type as 'signup' | 'email' | 'email_change' | 'recovery' | 'invite';
  }
  return 'signup';
}

/** A two-email confirmation can redirect without a browser session after its first step. */
export function authCallbackNoTokenState(flow: string | null): 'email_change_pending' | 'missing_token' {
  return flow === 'email-change' ? 'email_change_pending' : 'missing_token';
}

/** `new_email` is present until both secure-email-change confirmations finish. */
export function authCallbackSessionState(
  flow: string | null,
  pendingEmail: string | null | undefined
): 'email_change_pending' | 'verified' {
  return flow === 'email-change' && pendingEmail ? 'email_change_pending' : 'verified';
}
