import { describe, expect, it, vi } from 'vitest';
import { updatePasswordWithReauthentication } from './passwordChange';

describe('password change reauthentication', () => {
  it('submits the current and replacement passwords in one verified update', async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: null });

    await updatePasswordWithReauthentication(
      { updateUser },
      'current-secret',
      'new-secret',
    );

    expect(updateUser).toHaveBeenCalledWith({
      current_password: 'current-secret',
      password: 'new-secret',
    });
  });

  it('surfaces an update failure', async () => {
    const error = new Error('Session is no longer valid');
    await expect(updatePasswordWithReauthentication({
      updateUser: vi.fn().mockResolvedValue({ error }),
    }, 'current-secret', 'new-secret')).rejects.toBe(error);
  });
});
