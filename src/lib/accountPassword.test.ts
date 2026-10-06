import { describe, expect, it } from 'vitest';
import { preparePasswordChange, prepareRecoveredPassword } from './accountPassword';

describe('preparePasswordChange', () => {
  it('accepts matching non-empty passwords', () => {
    expect(preparePasswordChange('current-password', 'new-password', 'new-password')).toEqual({
      currentPassword: 'current-password',
      newPassword: 'new-password',
    });
  });

  it('requires the current password and a matching new password', () => {
    expect(preparePasswordChange('', 'new-password', 'new-password')).toEqual({
      error: 'Enter your current password.',
    });
    expect(preparePasswordChange('current-password', 'new-password', 'different')).toEqual({
      error: 'New passwords do not match.',
    });
  });

  it('rejects a weak or unchanged replacement password before contacting auth', () => {
    expect(preparePasswordChange('current-password', 'short', 'short')).toEqual({
      error: 'Use at least 8 characters for the new password.',
    });
    expect(preparePasswordChange('same-password', 'same-password', 'same-password')).toEqual({
      error: 'Choose a new password that is different from the current password.',
    });
  });

  it('validates both fields on the dedicated recovery page', () => {
    expect(prepareRecoveredPassword('new-password', 'different')).toEqual({
      error: 'New passwords do not match.',
    });
    expect(prepareRecoveredPassword('short', 'short')).toEqual({
      error: 'Use at least 8 characters for the new password.',
    });
    expect(prepareRecoveredPassword('new-password', 'new-password')).toEqual({
      newPassword: 'new-password',
    });
  });
});
