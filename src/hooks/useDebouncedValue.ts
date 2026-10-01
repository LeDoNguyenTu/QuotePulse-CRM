import { useEffect, useState } from 'react';

export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = globalThis.setTimeout(() => setSettled(value), delayMs);
    return () => globalThis.clearTimeout(timer);
  }, [delayMs, value]);

  return settled;
}
