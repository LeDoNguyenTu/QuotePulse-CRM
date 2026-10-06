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
  if (newPassword.length < 8) return { error: 'Use at least 8 characters for the new password.' };
  if (currentPassword === newPassword) return { error: 'Choose a new password that is different from the current password.' };
  return { currentPassword, newPassword };
}

type RecoveredPasswordPreparation = { newPassword: string } | { error: string };

/** Validate a new password entered after a recovery link has established a session. */
export function prepareRecoveredPassword(
  newPassword: string,
  confirmation: string,
): RecoveredPasswordPreparation {
  if (!newPassword) return { error: 'Enter a new password.' };
  if (newPassword !== confirmation) return { error: 'New passwords do not match.' };
  if (newPassword.length < 8) return { error: 'Use at least 8 characters for the new password.' };
  return { newPassword };
}
