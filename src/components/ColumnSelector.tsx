interface ColumnOption {
  id: string;
  label: string;
  group?: 'available' | 'hidden';
}

export function ColumnSelector({ options, visible, onChange, onRestore }: {
  options: ColumnOption[];
  visible: string[];
  onChange: (next: string[]) => void;
  onRestore: () => void;
}) {
  const selected = new Set(visible);
  const available = options.filter((option) => option.group !== 'hidden');
  const hidden = options.filter((option) => option.group === 'hidden');
  const renderOption = (option: ColumnOption) => <label key={option.id} className="flex gap-2 py-1 text-sm">
    <input type="checkbox" checked={selected.has(option.id)} onChange={() => {
      const next = selected.has(option.id) ? visible.filter((id) => id !== option.id) : [...visible, option.id];
      onChange(next);
    }} />
    <span>{option.label}{option.group === 'hidden' && <span className="ml-1 text-xs text-slate-500">(null)</span>}</span>
  </label>;
  return <details className="relative">
    <summary className="btn-secondary cursor-pointer list-none">Columns</summary>
    <div className="absolute right-0 z-20 mt-1 max-h-80 w-64 overflow-y-auto rounded-md border border-slate-200 bg-white p-3 shadow-lg">
      <button className="mb-2 text-xs text-brand-700 underline" onClick={(e) => { e.preventDefault(); onRestore(); }}>
        Restore defaults
      </button>
      {available.map(renderOption)}
      {hidden.length > 0 && <>
        <p className="mt-3 border-t border-slate-100 pt-2 text-xs font-medium text-slate-500">Hidden — no imported values yet</p>
        {hidden.map(renderOption)}
      </>}
    </div>
  </details>;
}
