import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const legacy = readFileSync(new URL('../src/pages/Settings.tsx', import.meta.url), 'utf8');
const sales = readFileSync(new URL('../src/pages/crm/CrmSalesSettings.tsx', import.meta.url), 'utf8');

describe('password settings routes', () => {
  it('uses the shared real password change method in both workspace settings screens', () => {
    expect(legacy).toMatch(/await changePassword\(currentPassword, newPassword, confirmPassword\)/);
    expect(sales).toMatch(/await changePassword\(currentPassword, newPassword, confirmPassword\)/);
  });

  it('clears successful form values and gives a truthful success message', () => {
    for (const source of [legacy, sales]) {
      expect(source).toContain("setCurrentPassword('')");
      expect(source).toContain("setNewPassword('')");
      expect(source).toContain("setConfirmPassword('')");
      expect(source).toContain('Your new password will be required the next time you sign in.');
    }
  });

  it('keeps legacy password validation separate from integration settings', () => {
    expect(legacy).toContain('preparePasswordChange(currentPassword, newPassword, confirmPassword)');
    expect(legacy).toContain('New password and confirmation must match');
    expect(legacy).toContain('Save integration & delivery settings');
    expect(legacy).toContain('does not change your password');
  });
});
