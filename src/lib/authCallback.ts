const AUTH_OTP_TYPES = new Set(['signup', 'email', 'email_change', 'recovery', 'invite']);

/** Return a Supabase email OTP type accepted by this callback. */
export function authOtpType(type: string | null): 'signup' | 'email' | 'email_change' | 'recovery' | 'invite' {
  if (type && AUTH_OTP_TYPES.has(type)) {
    return type as 'signup' | 'email' | 'email_change' | 'recovery' | 'invite';
  }
  return 'signup';
}
