type AuthResult = Promise<{ error: Error | null }>;

export type PasswordAuthClient = {
  signInWithPassword(credentials: { email: string; password: string }): AuthResult;
  updateUser(attributes: { password: string }): AuthResult;
};

export async function updatePasswordWithReauthentication(
  auth: PasswordAuthClient,
  email: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const verified = await auth.signInWithPassword({ email, password: currentPassword });
  if (verified.error) throw verified.error;

  const changed = await auth.updateUser({ password: newPassword });
  if (changed.error) throw changed.error;
}
