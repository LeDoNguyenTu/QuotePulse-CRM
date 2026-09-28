# Phase F tasks and reminders handoff

## Scope

- Follow-up tasks can be created atomically with a note or call.
- Task creation requires a title and due date; assignees must belong to the workspace.
- The dedicated task desk groups overdue, today, upcoming, completed, and cancelled work.
- A bounded PostgreSQL cron worker creates durable, idempotent in-app reminders.
- Reminder batches skip already-notified tasks, avoiding starvation beyond the first batch.
- Completing, cancelling, postponing, or reassigning a task dismisses its stale unread reminder.
- Users can mark reminders read in the task desk.

## Security and tenancy

- The activity-plus-task RPC validates authentication and workspace membership.
- Task assignees are workspace members, and browser reads/writes remain workspace scoped.
- The reminder worker is private, bounded to 1,000 rows, and executable only by `service_role`.
- Cron installation errors fail the migration rather than silently leaving reminders disabled.

## Verification

- `npm test -- --run`: 79 files, 331 tests passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed with the existing bundle-size warning.
- GitNexus reports the expected high-risk shared-workspace surface: 13 symbols across 11 flows.
- Supabase migration execution must be proven by the main-branch deployment workflow.
