import { describe, expect, it } from 'vitest';
import { localDateTimeValue, normalizeActivityInput } from './activityInput';

describe('CRM activity input', () => {
  it('requires text and normalizes timestamps', () => {
    expect(localDateTimeValue(new Date(2026, 8, 28, 10, 30))).toBe('2026-09-28T10:30');
    expect(normalizeActivityInput({ kind: 'note', body: '  ', occurredAt: '', updateLastCall: false })).toEqual({ ok: false, error: 'Activity text is required.' });
    expect(normalizeActivityInput({ kind: 'call', body: ' Spoke with buyer ', occurredAt: '2026-09-28T10:30', updateLastCall: true })).toMatchObject({
      ok: true,
      value: { kind: 'call', body: 'Spoke with buyer', occurredAt: new Date('2026-09-28T10:30').toISOString(), updateLastCall: true },
    });
  });

  it('requires task details when follow-up creation is selected', () => {
    expect(normalizeActivityInput({ kind: 'note', body: 'Note', occurredAt: '', updateLastCall: false, createTask: true })).toEqual({ ok: false, error: 'Task title is required.' });
    expect(normalizeActivityInput({ kind: 'note', body: 'Note', occurredAt: '', updateLastCall: false, createTask: true, taskTitle: 'Call buyer' })).toEqual({ ok: false, error: 'Choose a task due date.' });
    expect(normalizeActivityInput({ kind: 'note', body: 'Note', occurredAt: '', updateLastCall: false, createTask: true, taskTitle: 'Call buyer', taskDueAt: '2026-10-01T10:00', taskReminderAt: 'invalid' })).toEqual({ ok: false, error: 'Choose a valid reminder date.' });
  });
});
