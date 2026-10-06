type AuthResult = Promise<{ error: Error | null }>;

export type PasswordAuthClient = {
  updateUser(attributes: { password: string; current_password: string }): AuthResult;
};

export async function updatePasswordWithReauthentication(
  auth: PasswordAuthClient,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const changed = await auth.updateUser({
    password: newPassword,
    current_password: currentPassword,
  });
  if (changed.error) throw changed.error;
}
