export function formatUnknownError(error: unknown, fallback = 'Unknown error'): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  if (!error || typeof error !== 'object') return String(error ?? fallback);

  const value = error as Record<string, unknown>;
  const text = (key: string) => typeof value[key] === 'string' && value[key]
    ? String(value[key])
    : null;
  const message = text('message') ?? text('error') ?? fallback;
  const context = [text('details'), text('detail'), text('hint')]
    .filter((part): part is string => Boolean(part) && part !== message);
  const code = text('code');
  return [message, code ? `[${code}]` : null, ...context]
    .filter((part): part is string => Boolean(part))
    .join(' · ');
}
