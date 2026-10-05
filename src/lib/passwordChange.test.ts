import { describe, expect, it, vi } from 'vitest';
import { updatePasswordWithReauthentication } from './passwordChange';

describe('password change reauthentication', () => {
  it('verifies the current password before updating', async () => {
    const signInWithPassword = vi.fn().mockResolvedValue({ error: null });
    const updateUser = vi.fn().mockResolvedValue({ error: null });

    await updatePasswordWithReauthentication(
      { signInWithPassword, updateUser },
      'owner@example.test',
      'current-secret',
      'new-secret',
    );

    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'owner@example.test', password: 'current-secret' });
    expect(updateUser).toHaveBeenCalledWith({ password: 'new-secret' });
    expect(signInWithPassword.mock.invocationCallOrder[0]).toBeLessThan(updateUser.mock.invocationCallOrder[0]);
  });

  it('does not update when current-password verification fails', async () => {
    const error = new Error('Invalid login credentials');
    const updateUser = vi.fn();

    await expect(updatePasswordWithReauthentication({
      signInWithPassword: vi.fn().mockResolvedValue({ error }),
      updateUser,
    }, 'owner@example.test', 'wrong', 'new-secret')).rejects.toBe(error);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('surfaces an update failure after a successful reauthentication', async () => {
    const error = new Error('Session is no longer valid');
    await expect(updatePasswordWithReauthentication({
      signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
      updateUser: vi.fn().mockResolvedValue({ error }),
    }, 'owner@example.test', 'current-secret', 'new-secret')).rejects.toBe(error);
  });
});
