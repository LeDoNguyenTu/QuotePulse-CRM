// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Layout } from './Layout';

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ user: { email: 'owner@example.com' }, signOut: vi.fn() }),
}));

vi.mock('../hooks/useWorkspaces', () => ({
  useOptionalActiveWorkspace: () => ({ id: 'sales-id', name: 'Sales CRM', kind: 'sales_crm', role: 'owner' }),
}));

vi.mock('./crm/CrmReminderCenter', () => ({ CrmReminderCenter: () => <button>0 reminders</button> }));

describe('Layout grouped navigation interactions', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/w/sales-id/sales/contacts']}>
          <Layout area="sales"><p>Page content</p></Layout>
        </MemoryRouter>,
      );
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const button = (name: string) => Array.from(container.querySelectorAll('button')).find((item) => item.textContent?.includes(name))!;

  it('opens only one group at a time', () => {
    act(() => button('Outreach').click());
    expect(button('Outreach').getAttribute('aria-expanded')).toBe('true');

    act(() => button('Tools').click());
    expect(button('Outreach').getAttribute('aria-expanded')).toBe('false');
    expect(button('Tools').getAttribute('aria-expanded')).toBe('true');
  });

  it('dismisses an open group on outside click and Escape', () => {
    act(() => button('Outreach').click());
    act(() => document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
    expect(button('Outreach').getAttribute('aria-expanded')).toBe('false');

    act(() => button('Tools').click());
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(button('Tools').getAttribute('aria-expanded')).toBe('false');
  });

  it('dismisses the group after a destination is selected', () => {
    act(() => button('Outreach').click());
    const templates = Array.from(container.querySelectorAll('a')).find((item) => item.textContent === 'Templates')!;
    act(() => templates.click());
    expect(button('Outreach').getAttribute('aria-expanded')).toBe('false');
  });
});
