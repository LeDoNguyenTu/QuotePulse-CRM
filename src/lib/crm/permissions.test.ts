import { describe, expect, it } from 'vitest';
import { canDeleteCrmRecords } from './permissions';

describe('CRM permissions', () => {
  it('limits destructive actions to workspace owners and admins', () => {
    expect(canDeleteCrmRecords('owner')).toBe(true);
    expect(canDeleteCrmRecords('admin')).toBe(true);
    expect(canDeleteCrmRecords('member')).toBe(false);
  });
});
