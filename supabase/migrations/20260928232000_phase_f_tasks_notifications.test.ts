import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(new URL('./20260928232000_phase_f_tasks_notifications.sql', import.meta.url), 'utf8');

describe('Phase F task notifications migration', () => {
  it('creates activity and optional follow-up task atomically', () => {
    expect(sql).toMatch(/crm_add_activity_with_task/i);
    expect(sql).toMatch(/public\.crm_add_activity\(/i);
    expect(sql).toMatch(/insert into public\.crm_tasks/i);
    expect(sql).toMatch(/workspace_members/i);
    expect(sql).toMatch(/p_create_task boolean/i);
    expect(sql).toMatch(/task title is required/i);
  });

  it('materializes bounded idempotent reminders', () => {
    expect(sql).toMatch(/crm_materialize_task_notifications\(p_limit integer default 200\)/i);
    expect(sql).toMatch(/limit least\(greatest\(p_limit, 1\), 1000\)/i);
    expect(sql).toMatch(/unique index crm_notifications_task_user_generation_uidx/i);
    expect(sql).toMatch(/crm_list_workspace_members/i);
    expect(sql).toMatch(/on conflict .* do nothing/is);
    expect(sql).toMatch(/and not exists \(\s*select 1 from public\.crm_notifications/is);
    expect(sql).toMatch(/n\.reminder_at = t\.reminder_at/i);
    expect(sql).toMatch(/crm_tasks_reconcile_notifications/i);
    expect(sql).toMatch(/crm-task-reminders-every-minute/i);
    expect(sql).not.toMatch(/exception when others/i);
  });
});
