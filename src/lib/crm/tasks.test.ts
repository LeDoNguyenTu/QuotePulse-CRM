import { describe, expect, it } from 'vitest';
import { groupCrmTasks } from './tasks';

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
});
