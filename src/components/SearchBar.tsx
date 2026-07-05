import { useEffect, useState } from 'react';

interface SearchBarProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

/** Debounced search input (300ms) so we don't query on every keystroke. */
export function SearchBar({ value, onChange, placeholder }: SearchBarProps) {
  const [local, setLocal] = useState(value);

  useEffect(() => setLocal(value), [value]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (local !== value) onChange(local);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local]);

  return (
    <input
      className="input max-w-md"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      placeholder={placeholder ?? 'Search company, contact, email, industry…'}
    />
  );
}
