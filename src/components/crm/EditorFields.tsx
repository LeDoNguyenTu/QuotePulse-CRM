import type { ReactNode } from 'react';

export function EditorField({
  label,
  children,
  wide,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={wide ? 'sm:col-span-2' : undefined}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

export function EditorActions({ busy, onCancel }: { busy: boolean; onCancel: () => void }) {
  return (
    <div className="mt-5 flex justify-end gap-2 border-t border-slate-200 pt-4 sm:col-span-2">
      <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
      <button type="submit" className="btn-primary" disabled={busy}>
        {busy ? 'Saving…' : 'Save record'}
      </button>
    </div>
  );
}

export interface CompanyOption {
  id: string;
  name: string;
}

export function CompanySelect({
  value,
  companies,
  onChange,
}: {
  value: string;
  companies: CompanyOption[];
  onChange: (value: string) => void;
}) {
  return (
    <select className="input" value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">No company</option>
      {companies.map((company) => (
        <option key={company.id} value={company.id}>{company.name}</option>
      ))}
    </select>
  );
}
