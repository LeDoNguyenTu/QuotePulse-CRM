import type { ActivityDestination } from './activityExport';

export interface CrmActivityInput {
  kind: 'note' | 'call';
  body: string;
  occurredAt: string;
  updateLastCall: boolean;
  callOutcome?: string;
  taskTitle?: string;
  taskDueAt?: string;
  taskReminderAt?: string;
  taskAssigneeId?: string;
  createTask?: boolean;
  destination?: ActivityDestination;
}

export interface CrmActivityEditInput {
  kind: 'note' | 'call';
  body: string;
  occurredAt: string;
  callOutcome?: string;
  updateDeal: boolean;
}

export function localDateTimeValue(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function normalizeActivityInput(input: CrmActivityInput):
  | { ok: true; value: CrmActivityInput }
  | { ok: false; error: string } {
  const body = input.body.trim();
  if (!body) return { ok: false, error: 'Activity text is required.' };
  if (body.length > 20000) return { ok: false, error: 'Activity text cannot exceed 20,000 characters.' };
  const date = input.occurredAt ? new Date(input.occurredAt) : new Date();
  if (Number.isNaN(date.getTime())) return { ok: false, error: 'Choose a valid activity date.' };
  const taskTitle = input.taskTitle?.trim() || undefined;
  const taskDue = input.taskDueAt ? new Date(input.taskDueAt) : null;
  const taskReminder = input.taskReminderAt ? new Date(input.taskReminderAt) : null;
  const callOutcome = input.kind === 'call' ? input.callOutcome?.trim() || undefined : undefined;
  if (input.createTask && !taskTitle) return { ok: false, error: 'Task title is required.' };
  if (input.createTask && (!taskDue || Number.isNaN(taskDue.getTime()))) return { ok: false, error: 'Choose a task due date.' };
  if (input.createTask && taskReminder && Number.isNaN(taskReminder.getTime())) return { ok: false, error: 'Choose a valid reminder date.' };
  if (taskReminder && taskDue && taskReminder > taskDue) return { ok: false, error: 'Reminder cannot be after the due date.' };
  return { ok: true, value: {
    ...input, body, occurredAt: date.toISOString(), updateLastCall: input.kind === 'call' && input.updateLastCall,
    callOutcome,
    taskTitle, taskDueAt: taskDue?.toISOString(), taskReminderAt: taskReminder?.toISOString(),
    taskAssigneeId: input.taskAssigneeId || undefined,
    createTask: Boolean(input.createTask),
    destination: input.destination ?? null,
  } };
}

export function normalizeActivityEditInput(input: CrmActivityEditInput):
  | { ok: true; value: CrmActivityEditInput }
  | { ok: false; error: string } {
  const normalized = normalizeActivityInput({
    kind: input.kind,
    body: input.body,
    occurredAt: input.occurredAt,
    updateLastCall: input.updateDeal,
    callOutcome: input.callOutcome,
  });
  if (!normalized.ok) return normalized;
  return {
    ok: true,
    value: {
      kind: input.kind,
      body: normalized.value.body,
      occurredAt: normalized.value.occurredAt,
      callOutcome: normalized.value.callOutcome,
      updateDeal: input.kind === 'call' && input.updateDeal,
    },
  };
}
