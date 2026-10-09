import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useCrmTasks } from '../../hooks/crm/useCrmTasks';
import { selectPopupReminder } from '../../lib/crm/tasks';
import { crmRecordPath } from '../../lib/crm/salesRoutes';
import type { CrmNotification } from '../../lib/crm/types';

const SNOOZE_MS = 15 * 60 * 1000;

function readSessionJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const value = window.sessionStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

function notificationPath(workspaceId: string, notification: CrmNotification): string {
  const task = notification.task;
  if (task?.company_id) return crmRecordPath(workspaceId, 'company', task.company_id);
  if (task?.contact_id) return crmRecordPath(workspaceId, 'contact', task.contact_id);
  if (task?.deal_id) return crmRecordPath(workspaceId, 'deal', task.deal_id);
  return `/w/${encodeURIComponent(workspaceId)}/sales/tasks`;
}

export function CrmReminderCenter({ workspaceId }: { workspaceId: string }) {
  const api = useCrmTasks(workspaceId, { includeTasks: false });
  const location = useLocation();
  const centerRef = useRef<HTMLDivElement>(null);
  const notifications = api.notifications.data ?? [];
  const seenKey = `crm-reminders-seen:${workspaceId}`;
  const snoozeKey = `crm-reminders-snoozed:${workspaceId}`;
  const [panelOpen, setPanelOpen] = useState(false);
  const [seenIds, setSeenIds] = useState<Set<string>>(() => new Set(readSessionJson<string[]>(seenKey, [])));
  const [snoozedUntil, setSnoozedUntil] = useState<Record<string, number>>(() => readSessionJson<Record<string, number>>(snoozeKey, {}));
  const [clock, setClock] = useState(() => Date.now());
  const [popupId, setPopupId] = useState<string | null>(null);
  const candidate = useMemo(
    () => selectPopupReminder(notifications, seenIds, snoozedUntil, clock),
    [clock, notifications, seenIds, snoozedUntil],
  );
  const popup = notifications.find((notification) => notification.id === popupId) ?? candidate;

  useEffect(() => {
    if (!candidate || popupId) return;
    setPopupId(candidate.id);
    setSeenIds((current) => {
      if (current.has(candidate.id)) return current;
      const next = new Set(current).add(candidate.id);
      window.sessionStorage.setItem(seenKey, JSON.stringify([...next]));
      return next;
    });
    if (snoozedUntil[candidate.id]) {
      setSnoozedUntil((current) => {
        const next = { ...current };
        delete next[candidate.id];
        window.sessionStorage.setItem(snoozeKey, JSON.stringify(next));
        return next;
      });
    }
  }, [candidate, popupId, seenKey, snoozeKey, snoozedUntil]);

  useEffect(() => {
    const nextWake = Math.min(...Object.values(snoozedUntil).filter((time) => time > clock));
    if (!Number.isFinite(nextWake)) return undefined;
    const timer = window.setTimeout(() => setClock(Date.now()), Math.max(0, nextWake - Date.now()));
    return () => window.clearTimeout(timer);
  }, [clock, snoozedUntil]);

  const snooze = (notification: CrmNotification) => {
    const until = Date.now() + SNOOZE_MS;
    setSnoozedUntil((current) => {
      const next = { ...current, [notification.id]: until };
      window.sessionStorage.setItem(snoozeKey, JSON.stringify(next));
      return next;
    });
    setPopupId(null);
    setClock(Date.now());
  };
  const dismiss = (notification: CrmNotification) => {
    setPanelOpen(false);
    setPopupId(null);
    api.dismissNotification.mutate(notification.id);
  };

  useEffect(() => setPanelOpen(false), [location.pathname]);

  useEffect(() => {
    if (!panelOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!centerRef.current?.contains(event.target as Node)) setPanelOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPanelOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [panelOpen]);

  return <div ref={centerRef}><CrmReminderCenterView
      workspaceId={workspaceId}
      notifications={notifications}
      popup={popup}
      panelOpen={panelOpen}
      onTogglePanel={() => setPanelOpen((open) => !open)}
      onClosePanel={() => setPanelOpen(false)}
      onSnooze={(notification) => { setPanelOpen(false); snooze(notification); }}
      onDismiss={dismiss}
    /></div>;
}

export function CrmReminderCenterView({
  workspaceId,
  notifications,
  popup,
  panelOpen,
  onTogglePanel,
  onClosePanel,
  onSnooze,
  onDismiss,
}: {
  workspaceId: string;
  notifications: CrmNotification[];
  popup: CrmNotification | null;
  panelOpen: boolean;
  onTogglePanel: () => void;
  onClosePanel: () => void;
  onSnooze: (notification: CrmNotification) => void;
  onDismiss: (notification: CrmNotification) => void;
}) {
  return (
    <div className="relative">
      <button type="button" className="btn-secondary" aria-expanded={panelOpen} onClick={onTogglePanel}>
        {notifications.length} reminder{notifications.length === 1 ? '' : 's'}
      </button>
      {panelOpen && (
        <section className="absolute right-0 top-full z-40 mt-2 w-[min(24rem,calc(100vw-2rem))] rounded-lg border border-slate-200 bg-white p-3 text-slate-800 shadow-xl" aria-label="Task reminders">
          <h2 className="mb-2 font-semibold">Task reminders</h2>
          {notifications.length === 0 ? <p className="text-sm text-slate-500">No unread reminders.</p> : (
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {notifications.map((notification) => <ReminderCard key={notification.id} workspaceId={workspaceId} notification={notification} onOpenRecord={onClosePanel} onSnooze={onSnooze} onDismiss={onDismiss} />)}
            </div>
          )}
        </section>
      )}
      {popup && (
        <aside className="fixed bottom-4 right-4 z-50 w-[min(24rem,calc(100vw-2rem))] rounded-lg border border-amber-300 bg-amber-50 p-4 text-slate-900 shadow-2xl" aria-live="polite" aria-label="Task due soon">
          <p className="text-xs font-bold uppercase tracking-wide text-amber-800">Task due soon</p>
          <ReminderCard workspaceId={workspaceId} notification={popup} onOpenRecord={onClosePanel} onSnooze={onSnooze} onDismiss={onDismiss} />
        </aside>
      )}
    </div>
  );
}

function ReminderCard({ workspaceId, notification, onOpenRecord, onSnooze, onDismiss }: {
  workspaceId: string;
  notification: CrmNotification;
  onOpenRecord: () => void;
  onSnooze: (notification: CrmNotification) => void;
  onDismiss: (notification: CrmNotification) => void;
}) {
  return (
    <article className="rounded-md border border-slate-200 bg-white p-3">
      <strong className="block text-sm">{notification.title}</strong>
      {notification.due_at && <time className="mt-1 block text-xs text-slate-600">Due {new Date(notification.due_at).toLocaleString('en-SG')}</time>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Link className="btn-primary" to={notificationPath(workspaceId, notification)} onClick={onOpenRecord}>Open record</Link>
        <button type="button" className="btn-secondary" onClick={() => onSnooze(notification)}>Snooze 15 min</button>
        <button type="button" className="btn-secondary" onClick={() => onDismiss(notification)}>Dismiss</button>
      </div>
    </article>
  );
}
