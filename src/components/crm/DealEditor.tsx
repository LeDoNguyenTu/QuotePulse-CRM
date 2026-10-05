import { useState, type FormEvent } from 'react';
import { normalizeDealInput } from '../../lib/crm/inputs';
import type { CrmDeal, CrmDealInput } from '../../lib/crm/types';
import { ErrorState } from '../ui';
import { CompanySelect, EditorActions, EditorField, type CompanyOption } from './EditorFields';

function localDateTime(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function storedDateTime(value: string): string {
  return value ? new Date(value).toISOString() : '';
}

export function DealEditor({ initial, companies, busy, error, onCancel, onSave }: {
  initial?: CrmDeal | null;
  companies: CompanyOption[];
  busy: boolean;
  error: unknown;
  onCancel: () => void;
  onSave: (input: CrmDealInput) => void;
}) {
  const [form, setForm] = useState<Record<string, string>>({
    company_id: initial?.company_id ?? '', name: initial?.name ?? '', stage: initial?.stage ?? 'New',
    amount: initial?.amount?.toString() ?? '', currency: initial?.currency ?? 'SGD', status: initial?.status ?? 'open',
    owner_user_id: initial?.owner_user_id ?? '', last_call_at: localDateTime(initial?.last_call_at),
    follow_up_at: localDateTime(initial?.follow_up_at),
    call_outcome: initial?.call_outcome ?? '', appointment_status: initial?.appointment_status ?? '',
  });
  const [validationError, setValidationError] = useState<string | null>(null);
  const set = (field: string, value: string) => setForm((current) => ({ ...current, [field]: value }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = normalizeDealInput({
      ...form,
      last_call_at: storedDateTime(form.last_call_at),
      follow_up_at: storedDateTime(form.follow_up_at),
    });
    if (!result.ok) return setValidationError(result.error);
    setValidationError(null);
    onSave(result.value);
  };
  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
      {(validationError !== null || error != null) && (validationError
        ? <p className="sm:col-span-2 text-sm text-red-700">{validationError}</p>
        : <div className="sm:col-span-2"><ErrorState error={error} /></div>)}
      <EditorField label="Deal name" wide><input autoFocus required className="input" value={form.name} onChange={(e) => set('name', e.target.value)} /></EditorField>
      <EditorField label="Company"><CompanySelect value={form.company_id} companies={companies} onChange={(value) => set('company_id', value)} /></EditorField>
      <EditorField label="Stage"><input name="stage" required className="input" value={form.stage} onChange={(e) => set('stage', e.target.value)} /></EditorField>
      <EditorField label="Amount"><input className="input" type="number" min="0" step="0.01" value={form.amount} onChange={(e) => set('amount', e.target.value)} /></EditorField>
      <EditorField label="Currency"><input className="input uppercase" maxLength={3} value={form.currency} onChange={(e) => set('currency', e.target.value)} /></EditorField>
      <EditorField label="Status"><select className="input" value={form.status} onChange={(e) => set('status', e.target.value)}><option value="open">Open</option><option value="on_hold">On hold</option><option value="won">Won</option><option value="lost">Lost</option></select></EditorField>
      <EditorField label="Last call"><input className="input" type="datetime-local" value={form.last_call_at} onChange={(e) => set('last_call_at', e.target.value)} /></EditorField>
      <EditorField label="Follow up"><input className="input" type="datetime-local" value={form.follow_up_at} onChange={(e) => set('follow_up_at', e.target.value)} /></EditorField>
      <EditorField label="Call outcome"><input name="call_outcome" className="input" value={form.call_outcome} onChange={(e) => set('call_outcome', e.target.value)} /></EditorField>
      <EditorField label="Appointment status"><input name="appointment_status" className="input" value={form.appointment_status} onChange={(e) => set('appointment_status', e.target.value)} /></EditorField>
      <EditorActions busy={busy} onCancel={onCancel} />
    </form>
  );
}
