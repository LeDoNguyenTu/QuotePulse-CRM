import { useState, type FormEvent } from 'react';
import { localDateTimeValue, normalizeActivityEditInput, normalizeActivityInput, type CrmActivityEditInput, type CrmActivityInput } from '../../lib/crm/activityInput';
import type { ActivityDestinationOption } from '../../lib/crm/activityExport';
import type { CrmActivity } from '../../lib/crm/types';

export function CrmActivityComposer({ targetKind, pending, onSave, members = [], destinations = [] }: {
  targetKind: 'company' | 'contact' | 'deal';
  pending: boolean;
  onSave: (input: CrmActivityInput) => Promise<unknown>;
  members?: Array<{ user_id: string; label: string }>;
  destinations?: ActivityDestinationOption[];
}) {
  const [kind, setKind] = useState<'note' | 'call'>('note');
  const [body, setBody] = useState('');
  const [occurredAt, setOccurredAt] = useState(() => localDateTimeValue());
  const [updateLastCall, setUpdateLastCall] = useState(false);
  const [callOutcome, setCallOutcome] = useState('');
  const [createTask, setCreateTask] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDueAt, setTaskDueAt] = useState('');
  const [taskReminderAt, setTaskReminderAt] = useState('');
  const [taskAssigneeId, setTaskAssigneeId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [destinationIndex, setDestinationIndex] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const destination = destinationIndex === '' ? null : destinations[Number(destinationIndex)] ?? null;
    const normalized = normalizeActivityInput({ kind, body, occurredAt, updateLastCall, callOutcome, createTask, taskTitle: createTask ? taskTitle : undefined, taskDueAt: createTask ? taskDueAt : undefined, taskReminderAt: createTask ? taskReminderAt : undefined, taskAssigneeId: createTask ? taskAssigneeId || undefined : undefined, destination });
    if (!normalized.ok) { setError(normalized.error); return; }
    try {
      await onSave(normalized.value);
      setBody(''); setCallOutcome(''); setCreateTask(false); setTaskTitle(''); setTaskDueAt(''); setTaskReminderAt(''); setTaskAssigneeId(''); setDestinationIndex(''); setError(null);
    }
    catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
  };
  return <form className="crm-activity-composer" onSubmit={(event) => void submit(event)}>
    <div className="crm-panel-heading"><h2>Add activity</h2><span>Workspace private</span></div>
    <div className="crm-activity-fields"><label>Type<select className="input" value={kind} onChange={(event) => { setKind(event.target.value as 'note' | 'call'); if (event.target.value !== 'call') setUpdateLastCall(false); }}><option value="note">Note</option><option value="call">Call</option></select></label><label>Occurred at<input className="input" type="datetime-local" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} /></label></div>
    <label>Details<textarea className="input min-h-28" maxLength={20000} value={body} onChange={(event) => setBody(event.target.value)} /></label>
    {kind === 'call' && <label>Call outcome<input className="input" maxLength={160} value={callOutcome} onChange={(event) => setCallOutcome(event.target.value)} /></label>}
    {destinations.length > 0 && <label>Workbook destination<select className="input" value={destinationIndex} onChange={(event) => setDestinationIndex(event.target.value)}><option value="">Do not write this activity to a workbook</option>{destinations.map((destination, index) => <option key={`${destination.sourceImportId}:${destination.sourceRowNumber}:${destination.sourceColumn}`} value={index}>{destination.label}</option>)}</select></label>}
    {targetKind === 'deal' && kind === 'call' && <label className="crm-activity-check"><input type="checkbox" checked={updateLastCall} onChange={(event) => setUpdateLastCall(event.target.checked)} /> Update the deal's Last Call Date</label>}
    <label className="crm-activity-check"><input type="checkbox" checked={createTask} onChange={(event) => setCreateTask(event.target.checked)} /> Create a follow-up task</label>
    {createTask && <div className="crm-activity-fields"><label>Task title<input className="input" value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} /></label><label>Due at<input className="input" type="datetime-local" value={taskDueAt} onChange={(event) => setTaskDueAt(event.target.value)} /></label><label>Remind at<input className="input" type="datetime-local" value={taskReminderAt} onChange={(event) => setTaskReminderAt(event.target.value)} /></label><label>Assignee<select className="input" value={taskAssigneeId} onChange={(event) => setTaskAssigneeId(event.target.value)}><option value="">Me</option>{members.map((member) => <option key={member.user_id} value={member.user_id}>{member.label}</option>)}</select></label></div>}
    {error && <p className="text-sm text-red-700">{error}</p>}
    <button className="btn-primary" disabled={pending}>{pending ? 'Saving…' : 'Add activity'}</button>
  </form>;
}

export function CrmActivityEditor({ activity, pending, onCancel, onSave }: {
  activity: CrmActivity;
  pending: boolean;
  onCancel: () => void;
  onSave: (input: CrmActivityEditInput) => Promise<unknown>;
}) {
  const [body, setBody] = useState(activity.body);
  const [occurredAt, setOccurredAt] = useState(() => localDateTimeValue(new Date(activity.occurred_at)));
  const [callOutcome, setCallOutcome] = useState(activity.call_outcome ?? '');
  const [updateDeal, setUpdateDeal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const normalized = normalizeActivityEditInput({
      kind: activity.kind === 'call' ? 'call' : 'note', body, occurredAt, callOutcome, updateDeal,
    });
    if (!normalized.ok) return setError(normalized.error);
    try { await onSave(normalized.value); setError(null); }
    catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
  };
  return <form className="crm-activity-editor" onSubmit={(event) => void submit(event)}>
    <strong>Edit {activity.kind === 'call' ? 'call' : 'note'}</strong>
    <label>Occurred at<input className="input" type="datetime-local" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} /></label>
    <label>Details<textarea className="input min-h-24" maxLength={20000} value={body} onChange={(event) => setBody(event.target.value)} /></label>
    {activity.kind === 'call' && <label>Call outcome<input className="input" maxLength={160} value={callOutcome} onChange={(event) => setCallOutcome(event.target.value)} /></label>}
    {activity.kind === 'call' && activity.deal_id && <label className="crm-activity-check"><input type="checkbox" checked={updateDeal} onChange={(event) => setUpdateDeal(event.target.checked)} /> Update linked deal</label>}
    {error && <p className="text-sm text-red-700">{error}</p>}
    <div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button><button className="btn-primary" disabled={pending}>{pending ? 'Saving…' : 'Save changes'}</button></div>
  </form>;
}
