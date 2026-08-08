export interface NormalizedError {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
  status?: number;
}

const SECRET_KEY = /authorization|token|secret|api[_-]?key|password|connection|string|refresh/i;
const SECRET_VALUE = /(bearer\s+)[^\s,]+|([a-z_]*token["'=:\s]+)[^\s,"'}]+/gi;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[truncated]';
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        SECRET_KEY.test(key) ? '[redacted]' : redact(item, depth + 1),
      ])
    );
  }
  return typeof value === 'string' ? value.replace(SECRET_VALUE, '$1[redacted]$2[redacted]') : value;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function normalizeError(error: unknown): NormalizedError {
  if (error instanceof Error) return { message: error.message || 'An unexpected error occurred.' };
  if (typeof error === 'string') return { message: error || 'An unexpected error occurred.' };
  if (error && typeof error === 'object') {
    const safe = redact(error) as Record<string, unknown>;
    const message = text(safe.message) ?? text(safe.error) ?? 'An unexpected error occurred.';
    const json = JSON.stringify(safe);
    return {
      message,
      code: text(safe.code),
      details: text(safe.details) ?? (json !== '{}' ? json.slice(0, 2_000) : undefined),
      hint: text(safe.hint),
      status: typeof safe.status === 'number' ? safe.status : undefined,
    };
  }
  return { message: error == null ? 'An unexpected error occurred.' : String(error) };
}
