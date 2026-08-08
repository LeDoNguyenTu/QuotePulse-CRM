type PasswordChangePreparation =
  | { currentPassword: string; newPassword: string }
  | { error: string };

/** Validate the password fields before submitting them to Supabase Auth. */
export function preparePasswordChange(
  currentPassword: string,
  newPassword: string,
  confirmation: string
): PasswordChangePreparation {
  if (!currentPassword) return { error: 'Enter your current password.' };
  if (!newPassword) return { error: 'Enter a new password.' };
  if (newPassword !== confirmation) return { error: 'New passwords do not match.' };
  return { currentPassword, newPassword };
}
