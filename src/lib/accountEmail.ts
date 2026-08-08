const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type EmailChangePreparation = { email: string } | { error: string };

/** Validate the login-email change before calling Supabase Auth. */
export function prepareLoginEmailChange(
  currentEmail: string | null | undefined,
  requestedEmail: string
): EmailChangePreparation {
  const email = requestedEmail.trim();

  if (!EMAIL_RE.test(email)) return { error: 'Enter a valid email address.' };
  if (currentEmail?.trim().toLowerCase() === email.toLowerCase()) {
    return { error: 'Enter a different email address.' };
  }

  return { email };
}
