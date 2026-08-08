import { describe, expect, it } from 'vitest';
import { preparePasswordChange } from './accountPassword';

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
});
