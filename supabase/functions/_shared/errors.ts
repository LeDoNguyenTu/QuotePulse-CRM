const SENSITIVE_KEY = /authorization|token|secret|api[_-]?key|password|connection|string|refresh/i;

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[truncated]';
  if (Array.isArray(value)) return value.map((item) => sanitize(item, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key, SENSITIVE_KEY.test(key) ? '[redacted]' : sanitize(item, depth + 1),
    ]));
  }
  return value;
}

export function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const safe = sanitize(error) as Record<string, unknown>;
    if (typeof safe.message === 'string' && safe.message) return safe.message;
    return JSON.stringify(safe).slice(0, 2_000);
  }
  return error == null ? 'An unexpected error occurred.' : String(error);
}
