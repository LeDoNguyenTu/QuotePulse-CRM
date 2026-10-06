import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PasswordReset } from './PasswordReset';

vi.mock('../lib/supabase', () => ({
  supabase: { auth: { verifyOtp: vi.fn(), getSession: vi.fn() } },
}));

const authState = vi.hoisted(() => ({
  loading: false,
  session: null as { user: { id: string } } | null,
  completePasswordReset: vi.fn(),
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => authState,
}));

describe('PasswordReset', () => {
  beforeEach(() => {
    authState.loading = false;
    authState.session = null;
    authState.completePasswordReset.mockReset();
    vi.stubGlobal('window', { location: { hash: '' } });
  });

  it('shows a dedicated expired-link state when no recovery session exists', () => {
    const html = renderToStaticMarkup(<MemoryRouter><PasswordReset /></MemoryRouter>);

    expect(html).toContain('Reset link expired or invalid');
    expect(html).toContain('/forgot-password');
  });

  it('shows the new-password form when the recovery session is ready', () => {
    authState.session = { user: { id: 'user-1' } };
    vi.stubGlobal('window', { location: { hash: '#access_token=recovery-token' } });
    const html = renderToStaticMarkup(<MemoryRouter><PasswordReset /></MemoryRouter>);

    expect(html).toContain('Choose a new password');
    expect(html).toContain('New password');
    expect(html).toContain('Confirm new password');
  });
});
