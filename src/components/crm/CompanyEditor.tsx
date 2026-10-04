import { useState, type FormEvent } from 'react';
import { normalizeCompanyInput } from '../../lib/crm/inputs';
import type { CrmCompany, CrmCompanyInput } from '../../lib/crm/types';
import { ErrorState } from '../ui';
import { EditorActions, EditorField } from './EditorFields';
import { CRM_CUSTOMER_STATUSES } from '../../lib/crm/options';

export function CompanyEditor({
  initial,
  busy,
  error,
  onCancel,
  onSave,
}: {
  initial?: CrmCompany | null;
  busy: boolean;
  error: unknown;
  onCancel: () => void;
  onSave: (input: CrmCompanyInput) => void;
}) {
  const [form, setForm] = useState<Record<string, string>>({
    name: initial?.name ?? '',
    industry: initial?.industry ?? '',
    website: initial?.website ?? '',
    domain: initial?.domain ?? '',
    phone: initial?.phone ?? '',
    address_line_1: initial?.address_line_1 ?? '',
    address_line_2: initial?.address_line_2 ?? '',
    city: initial?.city ?? '',
    state_region: initial?.state_region ?? '',
    postal_code: initial?.postal_code ?? '',
    country: initial?.country ?? '',
    customer_status: initial?.customer_status ?? '',
  });
  const [validationError, setValidationError] = useState<string | null>(null);
  const set = (field: string, value: string) => setForm((current) => ({ ...current, [field]: value }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = normalizeCompanyInput(form);
    if (!result.ok) return setValidationError(result.error);
    setValidationError(null);
    onSave(result.value);
  };

  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
      {(validationError !== null || error != null) && (validationError
        ? <p className="sm:col-span-2 text-sm text-red-700">{validationError}</p>
        : <div className="sm:col-span-2"><ErrorState error={error} /></div>)}
      <EditorField label="Company name" wide><input autoFocus required className="input" value={form.name} onChange={(e) => set('name', e.target.value)} /></EditorField>
      <EditorField label="Industry"><input className="input" value={form.industry} onChange={(e) => set('industry', e.target.value)} /></EditorField>
      <EditorField label="Customer status"><input list="crm-customer-statuses" className="input" value={form.customer_status} onChange={(e) => set('customer_status', e.target.value)} placeholder="Choose or type a custom status" /><datalist id="crm-customer-statuses">{CRM_CUSTOMER_STATUSES.map((status) => <option key={status} value={status} />)}</datalist></EditorField>
      <EditorField label="Phone"><input className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></EditorField>
      <EditorField label="Website"><input className="input" type="url" value={form.website} onChange={(e) => set('website', e.target.value)} /></EditorField>
      <EditorField label="Domain"><input className="input" placeholder="example.com" value={form.domain} onChange={(e) => set('domain', e.target.value)} /></EditorField>
      <EditorField label="Address" wide><input className="input" value={form.address_line_1} onChange={(e) => set('address_line_1', e.target.value)} /></EditorField>
      <EditorField label="Address line 2" wide><input className="input" value={form.address_line_2} onChange={(e) => set('address_line_2', e.target.value)} /></EditorField>
      <EditorField label="City"><input className="input" value={form.city} onChange={(e) => set('city', e.target.value)} /></EditorField>
      <EditorField label="State / region"><input className="input" value={form.state_region} onChange={(e) => set('state_region', e.target.value)} /></EditorField>
      <EditorField label="Postal code"><input className="input" value={form.postal_code} onChange={(e) => set('postal_code', e.target.value)} /></EditorField>
      <EditorField label="Country"><input className="input" value={form.country} onChange={(e) => set('country', e.target.value)} /></EditorField>
      <EditorActions busy={busy} onCancel={onCancel} />
    </form>
  );
}
