import { useState, type FormEvent } from 'react';
import { normalizeContactInput } from '../../lib/crm/inputs';
import type { CrmContact, CrmContactInput } from '../../lib/crm/types';
import { ErrorState } from '../ui';
import { CompanySelect, EditorActions, EditorField, type CompanyOption } from './EditorFields';

export function ContactEditor({ initial, companies, busy, error, onCancel, onSave }: {
  initial?: CrmContact | null;
  companies: CompanyOption[];
  busy: boolean;
  error: unknown;
  onCancel: () => void;
  onSave: (input: CrmContactInput) => void;
}) {
  const [form, setForm] = useState<Record<string, string>>({
    company_id: initial?.company_id ?? '', first_name: initial?.first_name ?? '',
    last_name: initial?.last_name ?? '', full_name: initial?.full_name ?? '',
    email: initial?.email ?? '', phone: initial?.phone ?? '', job_title: initial?.job_title ?? '',
  });
  const [validationError, setValidationError] = useState<string | null>(null);
  const set = (field: string, value: string) => setForm((current) => ({ ...current, [field]: value }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = normalizeContactInput(form);
    if (!result.ok) return setValidationError(result.error);
    setValidationError(null);
    onSave(result.value);
  };
  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
      {(validationError !== null || error != null) && (validationError
        ? <p className="sm:col-span-2 text-sm text-red-700">{validationError}</p>
        : <div className="sm:col-span-2"><ErrorState error={error} /></div>)}
      <EditorField label="First name"><input autoFocus className="input" value={form.first_name} onChange={(e) => set('first_name', e.target.value)} /></EditorField>
      <EditorField label="Last name"><input className="input" value={form.last_name} onChange={(e) => set('last_name', e.target.value)} /></EditorField>
      <EditorField label="Display name" wide><input className="input" placeholder="Generated from first and last name" value={form.full_name} onChange={(e) => set('full_name', e.target.value)} /></EditorField>
      <EditorField label="Email"><input className="input" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></EditorField>
      <EditorField label="Phone"><input className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></EditorField>
      <EditorField label="Job title"><input className="input" value={form.job_title} onChange={(e) => set('job_title', e.target.value)} /></EditorField>
      <EditorField label="Company"><CompanySelect value={form.company_id} companies={companies} onChange={(value) => set('company_id', value)} /></EditorField>
      <EditorActions busy={busy} onCancel={onCancel} />
    </form>
  );
}
