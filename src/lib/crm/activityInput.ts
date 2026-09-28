export interface CrmActivityInput {
  kind: 'note' | 'call';
  body: string;
  occurredAt: string;
  updateLastCall: boolean;
}

export function localDateTimeValue(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function normalizeActivityInput(input: CrmActivityInput):
  | { ok: true; value: CrmActivityInput }
  | { ok: false; error: string } {
  const body = input.body.trim();
  if (!body) return { ok: false, error: 'Activity text is required.' };
  if (body.length > 20000) return { ok: false, error: 'Activity text cannot exceed 20,000 characters.' };
  const date = input.occurredAt ? new Date(input.occurredAt) : new Date();
  if (Number.isNaN(date.getTime())) return { ok: false, error: 'Choose a valid activity date.' };
  return { ok: true, value: { ...input, body, occurredAt: date.toISOString(), updateLastCall: input.kind === 'call' && input.updateLastCall } };
}
