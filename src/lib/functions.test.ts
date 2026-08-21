import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getSession, invoke } = vi.hoisted(() => ({ getSession: vi.fn(), invoke: vi.fn() }));
vi.mock('./supabase', () => ({
  supabase: {
    auth: { getSession },
    functions: { invoke },
  },
}));

import { functions } from './functions';

describe('company attachment function wrapper', () => {
  beforeEach(() => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'test-token' } } });
    invoke.mockReset();
    invoke.mockResolvedValue({ data: { attachments: [] }, error: null });
  });

  it('loads company attachments through the authenticated archive-aware endpoint', async () => {
    await functions.companyAttachments('company-id');
    expect(invoke).toHaveBeenCalledWith('company-attachments', expect.objectContaining({
      body: { company_id: 'company-id' },
    }));
  });

  it('loads archived deal properties through the authenticated endpoint', async () => {
    invoke.mockResolvedValue({ data: { properties: { 'deal-id': { custom: 'value' } } }, error: null });
    await functions.dealArchiveProperties(['deal-id']);
    expect(invoke).toHaveBeenCalledWith('deal-archive-properties', expect.objectContaining({
      body: { deal_ids: ['deal-id'] },
    }));
  });
});

describe('storage status function wrapper', () => {
  beforeEach(() => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'test-token' } } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('uses an authenticated GET so refreshing usage never starts a mutation', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      measuredAt: '2026-08-21T12:00:00Z',
      database: { usedBytes: 1, limitBytes: 2 },
      r2: { usedBytes: 3, limitBytes: 4, objectCount: 5, measuredAt: '2026-08-21T12:00:00Z', source: 'r2-inventory', cached: true },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await functions.storageStatus();
    expect(result.database).toEqual({ usedBytes: 1, limitBytes: 2 });
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/functions/v1/storage-status'), expect.objectContaining({ method: 'GET' }));
  });
});
