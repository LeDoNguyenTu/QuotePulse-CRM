import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(new URL('./20260929161500_phase_j_authenticated_grants.sql', import.meta.url), 'utf8');

describe('Phase J authenticated grants', () => {
  it('removes inherited mutation privileges from service-owned tables', () => {
    expect(sql).toMatch(/revoke insert, update, delete[\s\S]+hubspot_property_catalog[\s\S]+from authenticated/i);
    expect(sql).toMatch(/revoke all[\s\S]+email_unsubscribe_tokens[\s\S]+email_suppressions[\s\S]+from authenticated/i);
  });

  it('preserves only intentional browser mutations', () => {
    expect(sql).toMatch(/grant update on table public\.kyc_profiles to authenticated/i);
    expect(sql).toMatch(/grant insert, update on table public\.user_settings to authenticated/i);
    expect(sql).not.toMatch(/grant[^;]+(?:email_sends|hubspot_property_catalog)[^;]+(?:insert|update|delete)/i);
  });
});
