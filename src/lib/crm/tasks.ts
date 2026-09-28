export function groupCrmTasks<T extends { due_at: string | null; status: string }>(tasks: T[], now = new Date()) {
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  const groups = { overdue: [] as T[], today: [] as T[], upcoming: [] as T[], completed: [] as T[], cancelled: [] as T[] };
  for (const task of tasks) {
    if (task.status === 'completed') { groups.completed.push(task); continue; }
    if (task.status === 'cancelled') { groups.cancelled.push(task); continue; }
    if (!task.due_at || new Date(task.due_at) >= end) groups.upcoming.push(task);
    else if (new Date(task.due_at) < start) groups.overdue.push(task);
    else groups.today.push(task);
  }
  return groups;
}
