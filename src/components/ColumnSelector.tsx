import { useState } from 'react';

interface ColumnOption {
  id: string;
  label: string;
  group?: 'available' | 'hidden' | 'main' | 'additional' | 'source';
}

export function ColumnSelector({ options, visible, onChange, onRestore }: {
  options: ColumnOption[];
  visible: string[];
  onChange: (next: string[]) => void;
  onRestore: () => void;
}) {
  const [search, setSearch] = useState('');
  const selected = new Set(visible);
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filtered = normalizedSearch
    ? options.filter((option) => option.label.toLocaleLowerCase().includes(normalizedSearch))
    : options;
  const available = filtered.filter((option) => !option.group || option.group === 'available');
  const hidden = filtered.filter((option) => option.group === 'hidden');
  const grouped = [
    { id: 'main', label: 'Main columns' },
    { id: 'additional', label: 'Additional columns' },
    { id: 'source', label: 'Source & relationships' },
  ] as const;
  const renderOption = (option: ColumnOption) => <label key={option.id} className="flex gap-2 py-1 text-sm">
    <input type="checkbox" checked={selected.has(option.id)} onChange={() => {
      const next = selected.has(option.id) ? visible.filter((id) => id !== option.id) : [...visible, option.id];
      onChange(next);
    }} />
    <span>{option.label}{option.group === 'hidden' && <span className="ml-1 text-xs text-slate-500">(null)</span>}</span>
  </label>;
  return <details className="relative">
    <summary className="btn-secondary cursor-pointer list-none">Columns</summary>
    <div className="absolute right-0 z-20 mt-1 max-h-80 w-72 overflow-y-auto rounded-md border border-slate-200 bg-white p-3 shadow-lg">
      <button className="mb-2 text-xs text-brand-700 underline" onClick={(e) => { e.preventDefault(); onRestore(); }}>
        Restore defaults
      </button>
      <label className="mb-2 block">
        <span className="sr-only">Search columns</span>
        <input
          className="input min-h-8 w-full px-2 py-1 text-sm"
          type="search"
          placeholder="Search columns"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      {available.map(renderOption)}
      {grouped.map((group) => {
        const choices = filtered.filter((option) => option.group === group.id);
        if (choices.length === 0) return null;
        return <section key={group.id} className="mt-2 border-t border-slate-100 pt-2">
          <p className="text-xs font-semibold text-slate-500">{group.label}</p>
          {choices.map(renderOption)}
        </section>;
      })}
      {hidden.length > 0 && <>
        <p className="mt-3 border-t border-slate-100 pt-2 text-xs font-medium text-slate-500">Hidden — no imported values yet</p>
        {hidden.map(renderOption)}
      </>}
      {filtered.length === 0 && <p className="py-3 text-sm text-slate-500">No columns match that search.</p>}
    </div>
  </details>;
}
