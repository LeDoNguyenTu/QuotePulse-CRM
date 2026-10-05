import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { CrmNotification } from '../../lib/crm/types';
import { CrmReminderCenterView } from './CrmReminderCenter';

vi.mock('../../hooks/crm/useCrmTasks', () => ({ useCrmTasks: vi.fn() }));

describe('CRM reminder center', () => {
  it('renders one non-blocking popup plus a persistent unread reminder center', () => {
    const reminder = {
      id: 'notification-1', workspace_id: 'workspace-1', user_id: 'user-1', task_id: 'task-1',
      kind: 'task_reminder', status: 'unread', title: 'Call customer', body: null,
      due_at: '2026-10-05T09:00:00Z', reminder_at: '2026-10-05T08:45:00Z',
      read_at: null, created_by: 'user-1', created_at: '2026-10-05T08:45:00Z',
      task: { id: 'task-1', company_id: 'company-1', contact_id: null, deal_id: null },
    } satisfies CrmNotification;
    const html = renderToStaticMarkup(<MemoryRouter><CrmReminderCenterView
      workspaceId="workspace-1"
      notifications={[reminder]}
      popup={reminder}
      panelOpen
      onTogglePanel={vi.fn()}
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
});
