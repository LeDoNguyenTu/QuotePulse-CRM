import { useActiveWorkspace } from '../../hooks/useWorkspaces';
import { useCrmTasks } from '../../hooks/crm/useCrmTasks';
import { groupCrmTasks } from '../../lib/crm/tasks';
import type { CrmTask } from '../../lib/crm/types';
import { CrmPageHeader } from '../../components/crm/CrmPageChrome';
import { ErrorState, Spinner } from '../../components/ui';

const labels = { overdue: 'Overdue', today: 'Today', upcoming: 'Upcoming', completed: 'Completed', cancelled: 'Cancelled' } as const;

export function CrmTasks() {
  const workspace = useActiveWorkspace();
  const api = useCrmTasks(workspace.id);
  if (api.tasks.isLoading) return <Spinner label="Loading tasks…" />;
  if (api.tasks.error) return <ErrorState error={api.tasks.error} />;
  if (api.notifications.error) return <ErrorState error={api.notifications.error} />;
  const groups = groupCrmTasks(api.tasks.data ?? []);
  return <div className="space-y-6">
    <CrmPageHeader eyebrow="Follow-up desk" title="Tasks" description="Durable reminders grouped by what needs attention now." />
    {(api.updateStatus.error || api.markNotificationRead.error) && <p className="text-sm text-red-700">{String(api.updateStatus.error ?? api.markNotificationRead.error)}</p>}
    {(api.notifications.data?.length ?? 0) > 0 && <section className="border-l-4 border-amber-500 bg-amber-50 p-4"><strong>{api.notifications.data!.length} unread reminder{api.notifications.data!.length === 1 ? '' : 's'}</strong><div className="mt-3 space-y-2">{api.notifications.data!.map((notification: any) => <div key={notification.id} className="flex items-center justify-between gap-3"><span>{notification.title}{notification.due_at ? ` - due ${new Date(notification.due_at).toLocaleString('en-SG')}` : ''}</span><button className="btn-secondary" onClick={() => api.markNotificationRead.mutate(notification.id)}>Mark read</button></div>)}</div></section>}
    {(Object.keys(labels) as Array<keyof typeof labels>).map((key) => <section key={key} className="crm-detail-panel"><div className="crm-panel-heading"><h2>{labels[key]}</h2><span>{groups[key].length}</span></div>{groups[key].length ? <div className="crm-task-list">{groups[key].map((task: CrmTask) => <article key={task.id}><div><strong>{task.title}</strong><p>{task.company?.name ?? task.contact?.full_name ?? task.deal?.name ?? 'CRM follow-up'}</p></div><time>{task.due_at ? new Date(task.due_at).toLocaleString('en-SG') : 'No due date'}</time><select aria-label={`Status for ${task.title}`} value={task.status} onChange={(event) => api.updateStatus.mutate({ id: task.id, status: event.target.value as CrmTask['status'] })}><option value="open">Open</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></article>)}</div> : <p className="crm-panel-empty">No {labels[key].toLowerCase()} tasks.</p>}</section>)}
  </div>;
}
