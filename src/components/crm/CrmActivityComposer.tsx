import { useState, type FormEvent } from 'react';
import { localDateTimeValue, normalizeActivityInput, type CrmActivityInput } from '../../lib/crm/activityInput';

export function CrmActivityComposer({ targetKind, pending, onSave }: {
  targetKind: 'company' | 'contact' | 'deal';
  pending: boolean;
  onSave: (input: CrmActivityInput) => Promise<unknown>;
}) {
  const [kind, setKind] = useState<'note' | 'call'>('note');
  const [body, setBody] = useState('');
  const [occurredAt, setOccurredAt] = useState(() => localDateTimeValue());
  const [updateLastCall, setUpdateLastCall] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const normalized = normalizeActivityInput({ kind, body, occurredAt, updateLastCall });
    if (!normalized.ok) { setError(normalized.error); return; }
    try { await onSave(normalized.value); setBody(''); setError(null); }
    catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
  };
  return <form className="crm-activity-composer" onSubmit={(event) => void submit(event)}>
    <div className="crm-panel-heading"><h2>Add activity</h2><span>Workspace private</span></div>
    <div className="crm-activity-fields"><label>Type<select className="input" value={kind} onChange={(event) => { setKind(event.target.value as 'note' | 'call'); if (event.target.value !== 'call') setUpdateLastCall(false); }}><option value="note">Note</option><option value="call">Call</option></select></label><label>Occurred at<input className="input" type="datetime-local" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} /></label></div>
    <label>Details<textarea className="input min-h-28" maxLength={20000} value={body} onChange={(event) => setBody(event.target.value)} /></label>
    {targetKind === 'deal' && kind === 'call' && <label className="crm-activity-check"><input type="checkbox" checked={updateLastCall} onChange={(event) => setUpdateLastCall(event.target.checked)} /> Update the deal's Last Call Date</label>}
    {error && <p className="text-sm text-red-700">{error}</p>}
    <button className="btn-primary" disabled={pending}>{pending ? 'Saving…' : 'Add activity'}</button>
  </form>;
}
