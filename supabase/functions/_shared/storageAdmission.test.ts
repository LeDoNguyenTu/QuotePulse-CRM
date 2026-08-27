import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { assertStorageAdmission, decideStorageAdmission } from './storageAdmission.ts';

const allowedRow = {
  decision: 'allowed',
  database_bytes: 300_000_000,
  limit_bytes: 500_000_000,
  archive_pending: false,
  compaction_state: 'idle',
  reason: null,
};

describe('server-side storage admission', () => {
  it('allows only an explicit safe response', () => {
    expect(decideStorageAdmission([allowedRow], null)).toMatchObject({
      allowed: true,
      decision: 'allowed',
      databaseBytes: 300_000_000,
    });
  });

  it.each([
    ['archiving', 'idle'],
    ['capacity_guard', 'cooldown'],
    ['compacting', 'scheduled'],
    ['compacting', 'running'],
    ['compacting', 'retry_wait'],
  ])('denies the %s decision in %s state', (decision, compactionState) => {
    expect(decideStorageAdmission([{ ...allowedRow, decision, compaction_state: compactionState }], null))
      .toMatchObject({ allowed: false, decision });
  });

  it('fails closed on capacity even if a stale RPC row says allowed', () => {
    expect(decideStorageAdmission([{ ...allowedRow, database_bytes: 410_000_000 }], null))
      .toMatchObject({ allowed: false, decision: 'status_unavailable' });
  });

  it.each([
    [null, null],
    [[], null],
    [[{ ...allowedRow, decision: 'unexpected' }], null],
    [[{ ...allowedRow, archive_pending: true }], null],
    [[{ ...allowedRow, compaction_state: 'failed_closed' }], null],
    [[allowedRow], { message: 'database unavailable' }],
  ])('fails closed for malformed or unavailable status %#', (data, error) => {
    expect(decideStorageAdmission(data, error)).toMatchObject({
      allowed: false,
      decision: 'status_unavailable',
      status: 503,
    });
  });

  it('passes the authenticated owner id explicitly to the service RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [allowedRow], error: null });
    await expect(assertStorageAdmission({ rpc } as never, 'owner-123')).resolves.toMatchObject({ allowed: true });
    expect(rpc).toHaveBeenCalledWith('storage_import_admission', { p_owner_id: 'owner-123' });
  });

  it('runs admission before parsing rebuild mode, credentials, or HubSpot calls', () => {
    const source = readFileSync(new URL('../hubspot-ingest/index.ts', import.meta.url), 'utf8');
    const admission = source.indexOf('assertStorageAdmission(admin, userId)');
    expect(admission).toBeGreaterThan(-1);
    expect(admission).toBeLessThan(source.indexOf('req.json()'));
    expect(admission).toBeLessThan(source.indexOf("body?.mode === 'rebuild'"));
    expect(admission).toBeLessThan(source.indexOf('getUserSettings(admin, userId)'));
    expect(admission).toBeLessThan(source.indexOf('HubSpotClient.connect(token)'));
    expect(admission).toBeLessThan(source.indexOf("hs.countAll('deals')"));
  });
});
