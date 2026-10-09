// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CrmNotification } from '../../lib/crm/types';
import { CrmReminderCenter, CrmReminderCenterView } from './CrmReminderCenter';
import { useCrmTasks } from '../../hooks/crm/useCrmTasks';

vi.mock('../../hooks/crm/useCrmTasks', () => ({ useCrmTasks: vi.fn() }));

const reminder = {
  id: 'notification-1', workspace_id: 'workspace-1', user_id: 'user-1', task_id: 'task-1',
  kind: 'task_reminder', status: 'unread', title: 'Call customer', body: null,
  due_at: '2026-10-05T09:00:00Z', reminder_at: '2026-10-05T08:45:00Z',
  read_at: null, created_by: 'user-1', created_at: '2026-10-05T08:45:00Z',
  task: { id: 'task-1', company_id: 'company-1', contact_id: null, deal_id: null },
} satisfies CrmNotification;

describe('CRM reminder center', () => {
  it('renders one non-blocking popup plus a persistent unread reminder center', () => {
    const html = renderToStaticMarkup(<MemoryRouter><CrmReminderCenterView
      workspaceId="workspace-1"
      notifications={[reminder]}
      popup={reminder}
      panelOpen
      onTogglePanel={vi.fn()}
      onClosePanel={vi.fn()}
      onSnooze={vi.fn()}
      onDismiss={vi.fn()}
    /></MemoryRouter>);
    expect(html).toContain('1 reminder');
    expect(html).toContain('Task due soon');
    expect(html).toContain('Call customer');
    expect(html).toContain('Open record');
    expect(html).toContain('Snooze 15 min');
    expect(html).toContain('Dismiss');
    expect(html).toContain('/w/workspace-1/sales/companies/company-1');
  });

  describe('dropdown interactions', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
      (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
      window.sessionStorage.clear();
      vi.mocked(useCrmTasks).mockReturnValue({
        notifications: { data: [reminder] },
        dismissNotification: { mutate: vi.fn() },
      } as unknown as ReturnType<typeof useCrmTasks>);
      container = document.createElement('div');
      document.body.append(container);
      root = createRoot(container);
      act(() => root.render(<MemoryRouter><CrmReminderCenter workspaceId="workspace-1" /></MemoryRouter>));
    });

    afterEach(() => {
      act(() => root.unmount());
      container.remove();
    });

    const trigger = () => container.querySelector('button[aria-expanded]') as HTMLButtonElement;

    it('collapses on outside click and Escape', () => {
      act(() => trigger().click());
      expect(trigger().getAttribute('aria-expanded')).toBe('true');
      act(() => document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
      expect(trigger().getAttribute('aria-expanded')).toBe('false');

      act(() => trigger().click());
      act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
      expect(trigger().getAttribute('aria-expanded')).toBe('false');
    });

    it('collapses after choosing a reminder action', () => {
      act(() => trigger().click());
      const snooze = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Snooze 15 min')!;
      act(() => snooze.click());
      expect(trigger().getAttribute('aria-expanded')).toBe('false');
    });
  });
});
