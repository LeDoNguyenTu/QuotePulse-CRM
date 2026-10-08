import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(new URL('./20261009020000_restore_archived_record.sql', import.meta.url), 'utf8');

describe('restore archived record migration', () => {
  it('is service-role only, owner checked, fixed-table, transactional, and conflict safe', () => {
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/set search_path = ''/i);
    expect(sql).toMatch(/revoke all on function .* from public/i);
    expect(sql).toMatch(/grant execute on function .* to service_role/i);
    expect(sql).toMatch(/companies.*deals.*contacts/is);
    expect(sql).toMatch(/owner_id/i);
    expect(sql).toMatch(/already_restored/i);
    expect(sql).toMatch(/conflict/i);
    expect(sql).not.toMatch(/on conflict.*do update/is);
  });
});
