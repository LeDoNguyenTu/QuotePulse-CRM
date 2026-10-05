import { describe, expect, it } from 'vitest';
import { groupCrmTasks, selectPopupReminder } from './tasks';

const task = (id: string, due_at: string | null, status = 'open') => ({ id, due_at, status });

describe('CRM task grouping', () => {
  it('separates overdue, today, upcoming, and completed tasks', () => {
    const groups = groupCrmTasks([
      task('late', '2026-09-27T10:00:00Z'), task('today', '2026-09-28T12:00:00Z'),
      task('next', '2026-09-29T00:00:00Z'), task('done', '2026-09-20T00:00:00Z', 'completed'), task('stopped', null, 'cancelled'),
    ], new Date('2026-09-28T10:00:00Z'));
    expect(groups.overdue.map((item) => item.id)).toEqual(['late']);
    expect(groups.today.map((item) => item.id)).toEqual(['today']);
    expect(groups.upcoming.map((item) => item.id)).toEqual(['next']);
    expect(groups.completed.map((item) => item.id)).toEqual(['done']);
    expect(groups.cancelled.map((item) => item.id)).toEqual(['stopped']);
  });

  it('selects one unseen reminder and does not reopen a reminder already shown this session', () => {
    const reminders = [
      { id: 'newer', created_at: '2026-09-28T10:00:00Z' },
      { id: 'older', created_at: '2026-09-28T09:00:00Z' },
    ];
    expect(selectPopupReminder(reminders, new Set(), {}, Date.parse('2026-09-28T10:01:00Z'))?.id).toBe('newer');
    expect(selectPopupReminder(reminders, new Set(['newer']), {}, Date.parse('2026-09-28T10:01:00Z'))?.id).toBe('older');
    expect(selectPopupReminder(reminders, new Set(['newer', 'older']), {}, Date.parse('2026-09-28T10:01:00Z'))).toBeNull();
  });

  it('keeps snoozed reminders quiet until their snooze expires', () => {
    const reminders = [{ id: 'due', created_at: '2026-09-28T09:00:00Z' }];
    const seen = new Set(['due']);
    const snoozed = { due: Date.parse('2026-09-28T10:15:00Z') };
    expect(selectPopupReminder(reminders, seen, snoozed, Date.parse('2026-09-28T10:10:00Z'))).toBeNull();
    expect(selectPopupReminder(reminders, seen, snoozed, Date.parse('2026-09-28T10:16:00Z'))?.id).toBe('due');
  });
});
